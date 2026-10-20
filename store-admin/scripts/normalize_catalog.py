#!/usr/bin/env python3
"""Chuẩn hóa cache raw từ HTML thành catalog CRM."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = "https://fashion-studio.dicoding.dev"
RAW_PATH = ROOT / "data" / "raw" / "fashion-studio-products.json"
CLEAN_PATH = ROOT / "data" / "clean" / "products.json"
MIN_PRODUCTS = 80
MAX_PRODUCTS = 180
USD_TO_VND = 25_000


def map_category(title: str) -> str:
    name = title.lower()
    if any(word in name for word in ("shirt", "t-shirt", "top", "hoodie", "crewneck")):
        return "Áo thun"
    if any(word in name for word in ("jacket", "outerwear", "coat")):
        return "Áo khoác"
    if any(word in name for word in ("pants", "jeans", "trousers")):
        return "Quần"
    if any(word in name for word in ("dress", "skirt")):
        return "Váy"
    return "Phụ kiện"


def normalize_catalog() -> Path:
    raw = json.loads(RAW_PATH.read_text(encoding="utf-8"))
    if raw.get("source") != SOURCE or not isinstance(raw.get("products"), list):
        raise ValueError("Dữ liệu raw không thuộc Fashion Studio hoặc sai định dạng.")
    raw_products = raw["products"]
    if not MIN_PRODUCTS <= len(raw_products) <= MAX_PRODUCTS:
        raise ValueError(f"Dữ liệu raw phải có từ {MIN_PRODUCTS} đến {MAX_PRODUCTS} sản phẩm.")

    products = []
    seen_ids: set[int] = set()
    for item in raw_products:
        source_id = item.get("id")
        title = str(item.get("title") or "").strip()
        price = float(item.get("price", -1))
        if not isinstance(source_id, int) or source_id <= 0 or source_id in seen_ids:
            raise ValueError(f"Mã sản phẩm không hợp lệ hoặc bị trùng: {source_id}")
        if not title or len(title) > 200 or not re.search(r"\d+$", title):
            raise ValueError(f"Tên sản phẩm không hợp lệ: {title!r}")
        if not 0 <= price < 10_000_000:
            raise ValueError(f"Giá sản phẩm không hợp lệ: {price}")
        seen_ids.add(source_id)

        selling_price = round(price * USD_TO_VND / 1000) * 1000
        image = item.get("image")
        images = [image] if isinstance(image, str) and image.startswith("https://") else []
        specs = [
            value for value in (
                f"Size {item['size']}" if item.get("size") else "",
                f"phù hợp {item['gender']}" if item.get("gender") else "",
                f"{item['colorCount']} màu" if item.get("colorCount") else "",
            ) if value
        ]
        products.append({
            "sourceId": source_id,
            "productName": title,
            "description": ("Trang phục demo " + ", ".join(specs)).strip()[:2000] or title,
            "categoryName": map_category(title),
            "brandName": "Fashion Studio",
            "importPrice": round(selling_price * 0.55 / 1000) * 1000,
            "sellingPrice": selling_price,
            "imageUrl": images[0] if images else None,
            "images": images,
            "skuPrefix": f"FS-{source_id}",
        })

    if not MIN_PRODUCTS <= len(products) <= MAX_PRODUCTS:
        raise ValueError("Catalog sau chuẩn hóa không đạt số lượng demo từ 80 đến 180 sản phẩm.")
    CLEAN_PATH.parent.mkdir(parents=True, exist_ok=True)
    CLEAN_PATH.write_text(
        json.dumps({
            "source": SOURCE,
            "cleanedAt": datetime.now(timezone.utc).isoformat(),
            "products": products,
        }, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Đã chuẩn hóa {len(products)} sản phẩm: {CLEAN_PATH}")
    return CLEAN_PATH


if __name__ == "__main__":
    try:
        normalize_catalog()
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(f"Chuẩn hóa catalog thất bại: {error}") from error
