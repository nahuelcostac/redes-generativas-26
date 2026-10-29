import json
import tempfile
import unittest
from pathlib import Path

from rag import check_facts, chunk_documents, export_json, validate_documents, validate_questions


class RagTest(unittest.TestCase):
    def test_chunks_keep_section_and_size(self):
        text = "Introducción breve.\n# Premios\n" + "Una frase corta. " * 40 + "\nOtra línea."
        chunks = chunk_documents([{"id": "doc-1", "title": "Prueba", "text": text}], 200)
        self.assertEqual(chunks[0]["section"], "Introducción")
        self.assertTrue(all(chunk["section"] == "Premios" for chunk in chunks[1:]))
        self.assertTrue(all(len(chunk["text"]) <= 200 for chunk in chunks))
        self.assertEqual([chunk["id"] for chunk in chunks[:2]], ["doc-1-1", "doc-1-2"])
        joined = " ".join(chunk["text"].replace("\n", " ") for chunk in chunks[1:])
        self.assertEqual(joined.count("Una frase corta."), 40)

    def test_invalid_questions_are_rejected(self):
        valid = {"id": "a", "label": "A", "type": "direct", "text": "¿Qué?", "expected": []}
        cases = [{}, {"questions": []}, {"questions": [valid, valid]},
                 {"questions": [{**valid, "text": " "}]},
                 {"questions": [{**valid, "type": "otra"}]},
                 {"questions": [{**valid, "expected": [""]}]},
                 {"questions": [{**valid, "text": "x" * 1001}]}]
        for case in cases:
            with self.assertRaises(ValueError):
                validate_questions(case)
        self.assertTrue(validate_questions({"questions": [valid]}))

    def test_invalid_documents_are_rejected(self):
        document = {"id": "d", "title": "T", "url": "https://x", "text": "Texto"}
        for case in [{}, {"documents": []}, {"documents": [document, document]},
                     {"documents": [{**document, "text": ""}]}]:
            with self.assertRaises(ValueError):
                validate_documents(case)

    def test_check_facts_ignores_case(self):
        self.assertEqual(check_facts(["Golgi", "1906"], "compartido con golgi"),
                         {"Golgi": True, "1906": False})

    def test_export_replaces_file_completely(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "out.json"
            path.write_text("anterior", encoding="utf-8")
            export_json(path, {"respuesta": "ñ"})
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), {"respuesta": "ñ"})
            self.assertEqual(list(Path(folder).iterdir()), [path])


if __name__ == "__main__":
    unittest.main()
