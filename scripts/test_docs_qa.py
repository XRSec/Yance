#!/usr/bin/env python3
"""docs_qa 白名单 Schema 验证器的隔离单元测试。"""

import unittest

from scripts import docs_qa


class FormatTests(unittest.TestCase):
    def test_rfc3339_date_is_strict(self) -> None:
        self.assertTrue(docs_qa.valid_format("2026-08-27", "date"))
        self.assertFalse(docs_qa.valid_format("20260827", "date"))
        self.assertFalse(docs_qa.valid_format("2026-02-30", "date"))

    def test_rfc3339_datetime_requires_time_and_timezone(self) -> None:
        self.assertTrue(docs_qa.valid_format("2026-08-27T01:02:03Z", "date-time"))
        self.assertTrue(docs_qa.valid_format("2026-08-27t01:02:03.4+08:00", "date-time"))
        self.assertFalse(docs_qa.valid_format("2026-08-27", "date-time"))
        self.assertFalse(docs_qa.valid_format("2026-08-27T01:02:03", "date-time"))


class KeywordBranchTests(unittest.TestCase):
    def assert_rejected(self, instance: object, schema: dict) -> None:
        self.assertTrue(docs_qa.validate(instance, schema))

    def test_required(self) -> None:
        self.assert_rejected({}, {"type": "object", "required": ["id"], "properties": {}})

    def test_additional_properties(self) -> None:
        schema = {"type": "object", "properties": {}, "additionalProperties": False}
        self.assert_rejected({"unexpected": True}, schema)

    def test_pattern(self) -> None:
        self.assert_rejected("no-hash", {"type": "string", "pattern": "^sha256:[0-9a-f]{64}$"})

    def test_min_length(self) -> None:
        self.assert_rejected("short", {"type": "string", "minLength": 16})

    def test_union_type(self) -> None:
        schema = {"type": ["string", "null"]}
        self.assertEqual([], docs_qa.validate(None, schema))
        self.assertEqual([], docs_qa.validate("value", schema))
        self.assert_rejected(3, schema)

    def test_format_branch(self) -> None:
        self.assert_rejected("2026-08-27", {"type": "string", "format": "date-time"})


class SchemaDefinitionTests(unittest.TestCase):
    def test_unknown_type_is_rejected(self) -> None:
        failures = docs_qa.schema_definition_failures({"type": ["object", "bogus"]})
        self.assertTrue(failures)

    def test_keyword_value_types_are_checked(self) -> None:
        malformed = {
            "type": "object",
            "required": "id",
            "additionalProperties": {},
            "properties": [],
            "minLength": -1,
            "minimum": False,
            "pattern": "[",
            "format": "uri"
        }
        self.assertGreaterEqual(len(docs_qa.schema_definition_failures(malformed)), 7)


if __name__ == "__main__":
    unittest.main()
