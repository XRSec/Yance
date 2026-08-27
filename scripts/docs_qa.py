#!/usr/bin/env python3
"""Yance 文档结构、链接、JSON Schema 草案与合成 fixture 检查。仅使用标准库。"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
SCHEMAS = DOCS / "reference" / "contracts" / "proposed"
FIXTURES = DOCS / "validation" / "fixtures" / "synthetic"
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
RFC3339_DATE_RE = re.compile(
    r"^(?P<year>\d{4})-(?P<month>0[1-9]|1[0-2])-(?P<day>0[1-9]|[12]\d|3[01])$"
)
RFC3339_DATETIME_RE = re.compile(
    r"^(?P<date>\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))"
    r"[Tt](?:[01]\d|2[0-3]):[0-5]\d:(?:[0-5]\d|60)(?:\.\d+)?"
    r"(?:[Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$"
)
LINK_RE = re.compile(r"(?<!!)\[[^\]]*\]\(([^)]+)\)")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")
ALLOWED_STATUS = {"planning", "proposed", "moved"}
SCHEMA_KEYS = {
    "$schema", "$id", "title", "description", "type", "required",
    "additionalProperties", "properties", "items", "enum", "const",
    "minLength", "minimum", "pattern", "format",
}


def error(errors: list[str], path: Path | str, message: str) -> None:
    try:
        shown = Path(path).resolve().relative_to(ROOT)
    except (TypeError, ValueError):
        shown = path
    errors.append(f"{shown}: {message}")


def parse_front_matter(path: Path, errors: list[str]) -> dict[str, str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0] != "---":
        error(errors, path, "缺少 YAML front matter")
        return {}
    try:
        end = lines.index("---", 1)
    except ValueError:
        error(errors, path, "front matter 未闭合")
        return {}
    result: dict[str, str] = {}
    for number, line in enumerate(lines[1:end], 2):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            error(errors, path, f"front matter 第 {number} 行不是简单 key: value")
            continue
        key, value = line.split(":", 1)
        result[key.strip()] = value.strip().strip('"\'')
    return result


def check_front_matter(errors: list[str]) -> None:
    required = {"title", "status", "audience", "owner", "last_reviewed", "source_of_truth"}
    for path in sorted(DOCS.rglob("*.md")):
        metadata = parse_front_matter(path, errors)
        missing = sorted(required - metadata.keys())
        if missing:
            error(errors, path, f"front matter 缺字段: {', '.join(missing)}")
            continue
        if metadata["status"] not in ALLOWED_STATUS:
            error(errors, path, f"未知 status: {metadata['status']}")
        if metadata["owner"] != "UNSPECIFIED":
            error(errors, path, "owner 当前必须为 UNSPECIFIED")
        if not DATE_RE.fullmatch(metadata["last_reviewed"]):
            error(errors, path, "last_reviewed 必须为 YYYY-MM-DD")
        if metadata["source_of_truth"] not in {"true", "false"}:
            error(errors, path, "source_of_truth 必须是 true 或 false")
        if metadata["status"] == "moved":
            if metadata["source_of_truth"] != "false" or not metadata.get("redirect_to"):
                error(errors, path, "moved 页面必须 source_of_truth: false 且包含 redirect_to")
            elif not (path.parent / metadata["redirect_to"]).resolve().is_file():
                error(errors, path, "redirect_to 目标不存在")
        elif metadata["source_of_truth"] != "true":
            error(errors, path, "活动中文正文必须 source_of_truth: true")


def strip_code_and_front_matter(text: str) -> list[str]:
    lines = text.splitlines()
    if lines and lines[0] == "---":
        try:
            lines = lines[lines.index("---", 1) + 1 :]
        except ValueError:
            pass
    output: list[str] = []
    in_fence = False
    fence = ""
    for line in lines:
        match = re.match(r"^\s*(```+|~~~+)", line)
        if match:
            marker = match.group(1)
            if not in_fence:
                in_fence, fence = True, marker[0]
            elif marker[0] == fence:
                in_fence = False
            output.append("")
        elif in_fence:
            output.append("")
        else:
            output.append(line)
    return output


def github_slug(title: str) -> str:
    title = re.sub(r"<[^>]+>", "", title).strip().lower()
    title = re.sub(r"[`*_~]", "", title)
    title = re.sub(r"[^\w\-\u4e00-\u9fff ]", "", title)
    return re.sub(r"-+", "-", re.sub(r"\s+", "-", title)).strip("-")


def anchors(path: Path) -> set[str]:
    found: set[str] = set()
    counts: dict[str, int] = {}
    for line in strip_code_and_front_matter(path.read_text(encoding="utf-8")):
        match = HEADING_RE.match(line)
        if not match:
            continue
        base = github_slug(match.group(2))
        count = counts.get(base, 0)
        slug = base if count == 0 else f"{base}-{count}"
        counts[base] = count + 1
        found.add(slug)
    return found


def resolve_link(source: Path, raw: str) -> tuple[Path, str] | None:
    target = raw.strip()
    if target.startswith("<") and target.endswith(">"):
        target = target[1:-1]
    if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target) or target.startswith("//"):
        return None
    target = target.split(maxsplit=1)[0]
    path_part, _, fragment = target.partition("#")
    path_part = unquote(path_part)
    resolved = source if not path_part else (source.parent / path_part).resolve()
    if resolved.is_dir():
        index = resolved / "README.md"
        if index.exists():
            resolved = index
    return resolved, unquote(fragment)


def check_links(errors: list[str]) -> None:
    excluded = {".git", ".idea", ".build", "node_modules"}
    markdown = sorted(
        path for path in ROOT.rglob("*.md")
        if not excluded.intersection(path.relative_to(ROOT).parts)
    )
    anchor_cache: dict[Path, set[str]] = {}
    for source in markdown:
        lines = strip_code_and_front_matter(source.read_text(encoding="utf-8"))
        for number, line in enumerate(lines, 1):
            for raw in LINK_RE.findall(line):
                resolved = resolve_link(source, raw)
                if resolved is None:
                    continue
                target, fragment = resolved
                if not target.exists():
                    error(errors, source, f"第 {number} 行相对链接目标不存在: {raw}")
                    continue
                if fragment:
                    if target.suffix.lower() != ".md":
                        error(errors, source, f"第 {number} 行非 Markdown 目标不能检查 anchor: {raw}")
                        continue
                    known = anchor_cache.setdefault(target, anchors(target))
                    if fragment.lower() not in known:
                        error(errors, source, f"第 {number} 行 anchor 不存在: {raw}")


def schema_definition_failures(node: Any, at: str = "$") -> list[str]:
    """校验本项目白名单 JSON Schema 子集的 schema 本身。"""
    failures: list[str] = []
    if not isinstance(node, dict):
        return [f"{at}: schema 必须是 object"]
    for key in node:
        if key not in SCHEMA_KEYS:
            failures.append(f"{at}: 不支持关键词 {key}")

    for key in ("$schema", "$id", "title", "description"):
        if key in node and not isinstance(node[key], str):
            failures.append(f"{at}.{key}: 必须是 string")

    allowed_types = {"object", "array", "string", "number", "integer", "boolean", "null"}
    if "type" in node:
        declared = node["type"]
        choices = declared if isinstance(declared, list) else [declared]
        if not choices or any(not isinstance(item, str) or item not in allowed_types for item in choices):
            failures.append(f"{at}.type: 包含未知或无效类型")
        elif len(set(choices)) != len(choices):
            failures.append(f"{at}.type: 类型不得重复")

    if "required" in node:
        required = node["required"]
        if not isinstance(required, list) or any(not isinstance(item, str) for item in required):
            failures.append(f"{at}.required: 必须是 string array")
        elif len(set(required)) != len(required):
            failures.append(f"{at}.required: 字段不得重复")

    if "additionalProperties" in node and not isinstance(node["additionalProperties"], bool):
        failures.append(f"{at}.additionalProperties: 本项目子集只支持 boolean")

    properties = node.get("properties")
    if properties is not None:
        if not isinstance(properties, dict):
            failures.append(f"{at}.properties: 必须是 object")
        else:
            for name, child in properties.items():
                failures.extend(schema_definition_failures(child, f"{at}.properties.{name}"))

    if "items" in node:
        failures.extend(schema_definition_failures(node["items"], f"{at}.items"))

    if "enum" in node and (not isinstance(node["enum"], list) or not node["enum"]):
        failures.append(f"{at}.enum: 必须是非空 array")

    if "minLength" in node:
        value = node["minLength"]
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            failures.append(f"{at}.minLength: 必须是非负 integer")

    if "minimum" in node:
        value = node["minimum"]
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            failures.append(f"{at}.minimum: 必须是 number")

    if "pattern" in node:
        pattern = node["pattern"]
        if not isinstance(pattern, str):
            failures.append(f"{at}.pattern: 必须是 string")
        else:
            try:
                re.compile(pattern)
            except re.error:
                failures.append(f"{at}.pattern: 不是有效正则表达式")

    if "format" in node:
        value = node["format"]
        if not isinstance(value, str) or value not in {"date", "date-time"}:
            failures.append(f"{at}.format: 本项目子集只支持 date 或 date-time")
    return failures


def type_matches(value: Any, expected: str) -> bool:
    return {
        "object": isinstance(value, dict),
        "array": isinstance(value, list),
        "string": isinstance(value, str),
        "number": isinstance(value, (int, float)) and not isinstance(value, bool),
        "integer": isinstance(value, int) and not isinstance(value, bool),
        "boolean": isinstance(value, bool),
        "null": value is None,
    }.get(expected, False)


def valid_format(value: Any, name: str) -> bool:
    """严格校验项目使用的 RFC 3339 full-date 与 date-time。"""
    if not isinstance(value, str):
        return True
    if name == "date":
        match = RFC3339_DATE_RE.fullmatch(value)
        date_text = value
    elif name == "date-time":
        match = RFC3339_DATETIME_RE.fullmatch(value)
        date_text = match.group("date") if match else ""
    else:
        return False
    if not match:
        return False
    try:
        year, month, day = (int(part) for part in date_text.split("-"))
        dt.date(year, month, day)
    except ValueError:
        return False
    return True


def validate(instance: Any, schema: dict[str, Any], at: str = "$") -> list[str]:
    failures: list[str] = []
    expected = schema.get("type")
    if expected is not None:
        choices = expected if isinstance(expected, list) else [expected]
        if not any(type_matches(instance, item) for item in choices):
            return [f"{at}: type 应为 {choices}"]
    if "const" in schema and instance != schema["const"]:
        failures.append(f"{at}: 不等于 const")
    if "enum" in schema and instance not in schema["enum"]:
        failures.append(f"{at}: 不在 enum 中")
    if isinstance(instance, str):
        if len(instance) < schema.get("minLength", 0):
            failures.append(f"{at}: 字符串过短")
        if "pattern" in schema and not re.search(schema["pattern"], instance):
            failures.append(f"{at}: 不匹配 pattern")
        if "format" in schema and not valid_format(instance, schema["format"]):
            failures.append(f"{at}: format {schema['format']} 无效")
    if isinstance(instance, (int, float)) and not isinstance(instance, bool):
        if "minimum" in schema and instance < schema["minimum"]:
            failures.append(f"{at}: 小于 minimum")
    if isinstance(instance, dict):
        properties = schema.get("properties", {})
        for name in schema.get("required", []):
            if name not in instance:
                failures.append(f"{at}: 缺少 required {name}")
        if schema.get("additionalProperties") is False:
            for name in instance.keys() - properties.keys():
                failures.append(f"{at}: 不允许属性 {name}")
        for name, value in instance.items():
            if name in properties:
                failures.extend(validate(value, properties[name], f"{at}.{name}"))
    if isinstance(instance, list) and isinstance(schema.get("items"), dict):
        for index, value in enumerate(instance):
            failures.extend(validate(value, schema["items"], f"{at}[{index}]"))
    return failures


def check_json_and_fixtures(errors: list[str]) -> None:
    parsed: dict[Path, Any] = {}
    for path in sorted(DOCS.rglob("*.json")):
        try:
            parsed[path] = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            error(errors, path, f"JSON 解析失败: {exc}")
    schemas = sorted(SCHEMAS.glob("*.schema.json"))
    required_schema_fields = {"$schema", "$id", "title", "type", "required", "additionalProperties", "description"}
    for path in schemas:
        schema = parsed.get(path)
        if not isinstance(schema, dict):
            continue
        missing = required_schema_fields - schema.keys()
        if missing:
            error(errors, path, f"Schema 缺字段: {', '.join(sorted(missing))}")
        if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
            error(errors, path, "$schema 必须是 JSON Schema 2020-12")
        for failure in schema_definition_failures(schema):
            error(errors, path, failure)
        stem = path.name.removesuffix(".schema.json")
        for validity in ("valid", "invalid"):
            fixture = FIXTURES / f"{stem}.{validity}.json"
            if fixture not in parsed:
                error(errors, path, f"缺少 fixture: {fixture.name}")
                continue
            failures = validate(parsed[fixture], schema)
            if validity == "valid" and failures:
                error(errors, fixture, "valid fixture 被拒绝: " + "; ".join(failures[:3]))
            if validity == "invalid" and not failures:
                error(errors, fixture, "invalid fixture 未被拒绝")
        if stem == "mcp-capability-manifest":
            fixture = parsed.get(FIXTURES / f"{stem}.valid.json", {})
            names = {item.get("name") for item in fixture.get("tools", [])}
            for capability in fixture.get("capabilities", []):
                if capability.get("tool_ref") not in names:
                    error(errors, FIXTURES / f"{stem}.valid.json", "tool_ref 未指向 tools.name")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", nargs="?", default=str(ROOT), help="保留用于兼容；检查范围固定为仓库文档")
    parser.parse_args()
    errors: list[str] = []
    check_front_matter(errors)
    check_links(errors)
    check_json_and_fixtures(errors)
    if errors:
        print("docs_qa: FAILED", file=sys.stderr)
        for item in errors:
            print(f"- {item}", file=sys.stderr)
        return 1
    md_count = len(list(DOCS.rglob("*.md")))
    json_count = len(list(DOCS.rglob("*.json")))
    print(f"docs_qa: OK ({md_count} docs Markdown, {json_count} JSON, 4 schema/fixture pairs)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
