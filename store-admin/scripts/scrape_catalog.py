#!/usr/bin/env python3
"""Cào catalog HTML mẫu Fashion Studio và lưu bản raw để dùng lại."""

from __future__ import annotations

import argparse
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
SOURCE = "https://fashion-studio.dicoding.dev"
RAW_PATH = ROOT / "data" / "raw" / "fashion-studio-products.json"
USER_AGENT = "HungFashionCRM-DemoScraper/1.0 (SGU 841065; public HTML fashion catalog)"
REQUEST_DELAY_SECONDS = 1.5
MAX_PRODUCTS = 180
MIN_PRODUCTS = 80
MAX_PAGES = 20
TIMEOUT_SECONDS = (5, 25)


def check_robots(session: requests.Session) -> RobotFileParser | None:
    response = session.get(f"{SOURCE}/robots.txt", timeout=TIMEOUT_SECONDS)
    if response.status_code == 404:
        print("Nguồn không công bố robots.txt; tiếp tục giới hạn 180 sản phẩm và delay 1,5 giây.")
        return None
    response.raise_for_status()
    parser = RobotFileParser()
    parser.set_url(f"{SOURCE}/robots.txt")
    parser.parse(response.text.splitlines())
    return parser


def fetch_page(
    session: requests.Session,
    robots: RobotFileParser | None,
    url: str,
    request_number: int,
) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.netloc != urlparse(SOURCE).netloc:
        raise ValueError(f"Từ chối URL ngoài nguồn đã chọn: {url}")
    if robots and not robots.can_fetch(USER_AGENT, url):
        raise ValueError(f"robots.txt không cho phép cào: {url}")
    if request_number:
        time.sleep(REQUEST_DELAY_SECONDS)
    response = session.get(url, timeout=TIMEOUT_SECONDS)
    response.raise_for_status()
    if urlparse(response.url).netloc != urlparse(SOURCE).netloc:
        raise ValueError(f"Nguồn chuyển hướng ra host khác: {response.url}")
    if "text/html" not in response.headers.get("content-type", "").lower():
        raise ValueError(f"Nguồn không trả HTML tại {url}")
    return response.text


def product_from_card(card: BeautifulSoup, page_url: str) -> dict | None:
    title_element = card.select_one(".product-title")
    price_element = card.select_one(".price")
    image_element = card.select_one("img.collection-image")
    if not title_element or not price_element or not image_element:
        return None

    title = title_element.get_text(" ", strip=True)
    product_id_match = re.search(r"(\d+)\s*$", title)
    price_match = re.search(r"\d+(?:,\d{3})*(?:\.\d{1,2})?", price_element.get_text(" ", strip=True))
    image_url = urljoin(page_url, image_element.get("src", "").strip())
    if not product_id_match or title.lower() == "unknown product" or not price_match:
        return None
    if urlparse(image_url).scheme != "https":
        image_url = ""

    details = [node.get_text(" ", strip=True) for node in card.select(".product-details p")]
    size = next((text.split(":", 1)[1].strip() for text in details if text.lower().startswith("size:")), "")
    gender = next((text.split(":", 1)[1].strip() for text in details if text.lower().startswith("gender:")), "")
    colors_match = next((re.search(r"(\d+)\s+colors?", text, re.IGNORECASE) for text in details
                         if re.search(r"\d+\s+colors?", text, re.IGNORECASE)), None)

    return {
        "id": int(product_id_match.group(1)),
        "title": title[:200],
        "price": float(price_match.group(0).replace(",", "")),
        "currency": "USD",
        "image": image_url or None,
        "size": size[:20],
        "gender": gender[:30],
        "colorCount": int(colors_match.group(1)) if colors_match else None,
        "sourceUrl": page_url,
    }


def scrape_catalog(force: bool = False) -> Path:
    if RAW_PATH.exists() and not force:
        cached = json.loads(RAW_PATH.read_text(encoding="utf-8"))
        if cached.get("source") != SOURCE or not isinstance(cached.get("products"), list):
            raise ValueError("Cache raw không thuộc nguồn Fashion Studio hoặc sai định dạng.")
        if MIN_PRODUCTS <= len(cached["products"]) <= MAX_PRODUCTS:
            print(f"Dùng cache HTML đã cào bằng Python: {RAW_PATH} ({len(cached['products'])} sản phẩm)")
            return RAW_PATH
        raise ValueError("Cache raw phải có từ 80 đến 180 sản phẩm; hãy cào lại bằng --force.")

    session = requests.Session()
    session.headers.update({
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
    })
    robots = check_robots(session)
    time.sleep(REQUEST_DELAY_SECONDS)
    products_by_id: dict[int, dict] = {}
    page_url = f"{SOURCE}/"
    visited: set[str] = set()
    request_number = 0

    while page_url and len(products_by_id) < MAX_PRODUCTS and request_number < MAX_PAGES:
        if page_url in visited:
            raise ValueError(f"Phát hiện vòng lặp phân trang tại {page_url}")
        visited.add(page_url)
        html = fetch_page(session, robots, page_url, request_number)
        request_number += 1
        soup = BeautifulSoup(html, "html.parser")
        cards = soup.select(".collection-card")
        if not cards:
            raise ValueError(f"Không tìm thấy thẻ sản phẩm tại {page_url}; dừng thay vì dùng dữ liệu cũ.")
        for card in cards:
            product = product_from_card(card, page_url)
            if product:
                products_by_id.setdefault(product["id"], product)
                if len(products_by_id) >= MAX_PRODUCTS:
                    break

        next_link = next(
            (link for link in soup.select("a[href]") if link.get_text(" ", strip=True).lower() == "next"),
            None,
        )
        next_url = urljoin(page_url, next_link["href"]) if next_link else ""
        if next_url:
            next_path = urlparse(next_url).path
            if next_path not in ("/",) and not re.fullmatch(r"/page\d+", next_path):
                raise ValueError(f"Liên kết phân trang không hợp lệ: {next_url}")
        page_url = next_url
        print(f"Đã đọc trang {request_number}: {len(products_by_id)} sản phẩm hợp lệ.")

    products = list(products_by_id.values())[:MAX_PRODUCTS]
    if len(products) < MIN_PRODUCTS:
        raise ValueError(
            f"Chỉ cào được {len(products)} sản phẩm (cần ít nhất {MIN_PRODUCTS}); dừng để không nạp catalog thiếu."
        )

    RAW_PATH.parent.mkdir(parents=True, exist_ok=True)
    RAW_PATH.write_text(
        json.dumps({
            "source": SOURCE,
            "scrapedAt": datetime.now(timezone.utc).isoformat(),
            "userAgent": USER_AGENT,
            "delaySeconds": REQUEST_DELAY_SECONDS,
            "products": products,
        }, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Đã cào HTML bằng Python và lưu {len(products)} bản ghi raw: {RAW_PATH}")
    return RAW_PATH


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Cào lại thay vì dùng cache raw")
    arguments = parser.parse_args()
    try:
        scrape_catalog(force=arguments.force)
    except (requests.RequestException, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(f"Cào catalog thất bại: {error}") from error
