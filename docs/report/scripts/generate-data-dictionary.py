#!/usr/bin/env python3
"""Generate Appendix B from the checked-in schema-only PostgreSQL dump."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCHEMA = ROOT / "database" / "schema.sql"
OUTPUT = ROOT / "docs" / "report" / "04-tu-dien-du-lieu.tex"


def old_meanings(text: str) -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    blocks = re.finditer(r"\\section\{Bảng ([^}]+)\}(.*?)(?=\\section\{|\Z)", text, re.S)
    for block in blocks:
        table = block.group(1).replace(r"\_", "_")
        fields: dict[str, str] = {}
        for line in block.group(2).splitlines():
            cells = line.split("&")
            if len(cells) < 3:
                continue
            field = cells[0].strip().replace(r"\_", "_")
            if not re.fullmatch(r"[a-z][a-z0-9_]*", field):
                continue
            meaning = re.split(r"\\\\", cells[2], maxsplit=1)[0].strip()
            if meaning:
                fields[field] = meaning
        result[table] = fields
    return result


def sql_identifier(value: str) -> str:
    return value.strip().strip('"')


def parse_schema(sql: str) -> tuple[list[dict], dict[str, list[str]]]:
    tables: list[dict] = []
    by_table: dict[str, dict] = {}
    table_re = re.compile(r'CREATE TABLE public\.(?:"([^"]+)"|([a-zA-Z0-9_]+))\s*\((.*?)\n\);', re.S)
    for match in table_re.finditer(sql):
        name = match.group(1) or match.group(2)
        table = {"name": name, "columns": {}, "checks": []}
        for raw_line in match.group(3).splitlines():
            line = raw_line.strip().rstrip(",")
            column = re.match(r"([a-zA-Z_][a-zA-Z0-9_]*)\s+(.+)$", line)
            if not column or column.group(1).upper() in {"CONSTRAINT", "PRIMARY", "UNIQUE", "CHECK", "FOREIGN"}:
                continue
            table["columns"][column.group(1)] = {"declaration": column.group(2).strip(), "constraints": []}
        tables.append(table)
        by_table[name] = table

    for match in re.finditer(
        r'ALTER TABLE ONLY public\.(?:"([^"]+)"|([a-zA-Z0-9_]+))\s+ADD CONSTRAINT\s+[a-zA-Z0-9_]+\s+(.*?);',
        sql,
        re.S,
    ):
        table_name = match.group(1) or match.group(2)
        table = by_table.get(table_name)
        if not table:
            continue
        clause = " ".join(match.group(3).split())
        primary = re.search(r"PRIMARY KEY \(([^)]+)\)", clause, re.I)
        unique = re.search(r"UNIQUE \(([^)]+)\)", clause, re.I)
        foreign = re.search(
            r'FOREIGN KEY \(([^)]+)\) REFERENCES public\.(?:"([^"]+)"|([a-zA-Z0-9_]+))\(([^)]+)\)(.*)',
            clause,
            re.I,
        )
        check = re.search(r"CHECK \((.*)\)$", clause, re.I)
        if primary:
            for field in primary.group(1).split(","):
                table["columns"].get(sql_identifier(field), {}).get("constraints", []).append("PRIMARY KEY")
        elif unique:
            fields = [sql_identifier(field) for field in unique.group(1).split(",")]
            if len(fields) == 1:
                table["columns"].get(fields[0], {}).get("constraints", []).append("UNIQUE")
            else:
                table["checks"].append("UNIQUE (" + ", ".join(fields) + ")")
        elif foreign:
            field = sql_identifier(foreign.group(1))
            target = foreign.group(2) or foreign.group(3)
            target_column = sql_identifier(foreign.group(4))
            delete = re.search(r"ON DELETE (CASCADE|SET NULL|SET DEFAULT|RESTRICT|NO ACTION)", foreign.group(5), re.I)
            suffix = f" ON DELETE {delete.group(1).upper()}" if delete else ""
            table["columns"].get(field, {}).get("constraints", []).append(f"REFERENCES {target}({target_column}){suffix}")
        elif check:
            table["checks"].append("CHECK (" + check.group(1) + ")")

    for match in re.finditer(
        r'ALTER TABLE(?: ONLY)? public\.(?:"([^"]+)"|([a-zA-Z0-9_]+))\s+ALTER COLUMN ([a-zA-Z0-9_]+)\s+(SET DEFAULT (.*?);|ADD GENERATED (?:ALWAYS|BY DEFAULT) AS IDENTITY)',
        sql,
        re.S,
    ):
        table_name = match.group(1) or match.group(2)
        column = match.group(3)
        operation = " ".join(match.group(4).split())
        table = by_table.get(table_name)
        field = table["columns"].get(column) if table else None
        if not field:
            continue
        if operation.startswith("SET DEFAULT "):
            field["declaration"] += " DEFAULT " + operation[len("SET DEFAULT ") :].rstrip(";")
        else:
            field["declaration"] += " " + operation

    indexes: dict[str, list[str]] = {name: [] for name in by_table}
    for match in re.finditer(
        r'CREATE (UNIQUE )?INDEX ([a-zA-Z0-9_]+) ON public\.(?:"([^"]+)"|([a-zA-Z0-9_]+)) USING ([a-zA-Z0-9_]+) \((.*?)\)( WHERE .*?)?;',
        sql,
        re.S,
    ):
        unique, index_name, quoted_table, plain_table, method, fields, where = match.groups()
        table_name = quoted_table or plain_table
        details = f"{index_name} ({'UNIQUE, ' if unique else ''}{method}: {' '.join(fields.split())}"
        if where:
            details += " " + " ".join(where.split())
        indexes.setdefault(table_name, []).append(details + ")")
    indexes = {name: sorted(set(items)) for name, items in indexes.items()}
    return tables, indexes


def tex(value: str) -> str:
    replacements = {
        "\\": r"\textbackslash{}", "&": r"\&", "%": r"\%", "$": r"\$",
        "#": r"\#", "_": r"\_", "{": r"\{", "}": r"\}",
        "~": r"\textasciitilde{}", "^": r"\textasciicircum{}",
    }
    return "".join(replacements.get(char, char) for char in value)


def main() -> None:
    old_text = OUTPUT.read_text(encoding="utf-8")
    meanings = old_meanings(old_text)
    meanings["store_admin_schema_migrations"] = {
        "version": "Phiên bản migration đã áp dụng",
        "name": "Tên migration đã áp dụng",
        "applied_at": "Thời điểm áp dụng migration",
    }
    meanings["demo_payment_tokens"] = {
        "demo_payment_token_id": "Mã định danh bản ghi token thanh toán demo",
        "order_id": "Mã đơn hàng được phép xác nhận bằng token",
        "token_hash": "Giá trị băm của token; không lưu token gốc",
        "expires_at": "Thời điểm token hết hạn",
        "used_at": "Thời điểm token được sử dụng; NULL nếu chưa dùng",
        "created_at": "Thời điểm tạo bản ghi token",
    }
    meanings["transactions"].pop("payload", None)
    meanings["user_events"].pop("payload", None)
    meanings.get("employee", {}).pop("position", None)

    sql = SCHEMA.read_text(encoding="utf-8")
    tables, indexes = parse_schema(sql)
    if len(tables) != 40:
        raise SystemExit(f"Expected 40 tables in {SCHEMA}, found {len(tables)}")

    lines = [
        r"\chapter{Từ điển dữ liệu chi tiết}",
        r"Từ điển này được sinh từ schema-only dump hiện hành \texttt{database/schema.sql}, gồm 40 bảng như bảng đối chiếu số dòng tại Mục~\ref{sec:backup-restore}. Kiểu, giá trị mặc định, khóa và chỉ mục lấy từ dump; ý nghĩa cột được diễn giải theo nghiệp vụ ứng dụng.",
        r"Bảng \texttt{customer\_interest\_map} chỉ là bảng chuyển tiếp trong migration cũ; sau khi chuyển đổi, bảng chính thức là \texttt{customer\_interest} và không được tính như một bảng riêng.",
        r"\small",
    ]
    for table in tables:
        name = table["name"]
        field_meanings = meanings.get(name, {})
        unknown = sorted(set(table["columns"]) - set(field_meanings))
        if unknown:
            raise SystemExit(f"Missing Vietnamese meanings for {name}: {', '.join(unknown)}")
        lines.extend([
            rf"\section{{Bảng {tex(name)}}}",
            r"\begin{longtable}{|p{0.17\textwidth}|p{0.47\textwidth}|p{0.23\textwidth}|}\hline",
            r"\textbf{Thuộc tính}&\textbf{Kiểu và ràng buộc}&\textbf{Ý nghĩa}\\\hline\endhead",
        ])
        for column, details in table["columns"].items():
            declaration = " ".join(details["declaration"].split())
            declaration += " " + " ".join(dict.fromkeys(details["constraints"])) if details["constraints"] else ""
            lines.append(f"{tex(column)} & {tex(declaration.strip())} & {field_meanings[column]}\\\\\\hline")
        notes = []
        if table["checks"]:
            notes.append("Ràng buộc: " + "; ".join(sorted(set(table["checks"]))))
        if indexes.get(name):
            notes.append("Chỉ mục: " + "; ".join(indexes[name]))
        for note in notes:
            lines.append(r"\multicolumn{3}{|p{0.93\textwidth}|}{" + tex(note) + r"}\\\hline")
        lines.extend([r"\end{longtable}", r"\normalsize"])
    OUTPUT.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
