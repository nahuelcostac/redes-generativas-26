"""Pruebas de las partes del flujo que no necesitan los modelos."""

import json
import tempfile
import unittest
from pathlib import Path

import rag

DOCUMENT = {
    "id": "doc",
    "title": "Documento",
    "text": "Primer párrafo de introducción.\n\n\n== Historia ==\n"
            + " ".join(f"p{number}" for number in range(50))
            + "\n\n\n== Referencias ==\nEnlace\n\n== Vacía ==\n",
}


class ChunkingTest(unittest.TestCase):
    def test_sections_skip_references_and_empty_bodies(self):
        sections = rag.split_sections(DOCUMENT["text"])
        self.assertEqual([name for name, _ in sections], ["Introducción", "Historia"])

    def test_windows_overlap_and_cover_every_word(self):
        chunks = rag.chunk_documents([DOCUMENT], chunk_words=20, overlap_words=5)
        history = [chunk["text"].split() for chunk in chunks if chunk["section"] == "Historia"]
        self.assertEqual([len(words) for words in history], [20, 20, 20])
        self.assertEqual(history[0][-5:], history[1][:5])
        self.assertEqual(history[-1][-1], "p49")
        self.assertEqual(len({chunk["id"] for chunk in chunks}), len(chunks))


class RetrievalTest(unittest.TestCase):
    def test_rank_orders_by_score_and_breaks_ties_by_position(self):
        self.assertEqual(rag.rank([0.2, 0.9, 0.5, 0.9], 3), [1, 3, 2])

    def test_messages_with_and_without_context(self):
        with_context = rag.build_messages("¿Pregunta?", ["uno", "dos"])
        self.assertIn("[1] uno\n\n[2] dos", with_context[1]["content"])
        self.assertIn(rag.NO_ANSWER, with_context[0]["content"])
        without_context = rag.build_messages("¿Pregunta?")
        self.assertEqual(without_context[1]["content"], "¿Pregunta?")
        self.assertNotIn("Fragmentos", without_context[0]["content"])

    def test_cited_fragments_ignore_repeats_and_out_of_range(self):
        self.assertEqual(rag.cited_fragments("Según [2] y [1], y otra vez [2] o [9].", 4), [2, 1])


class ValidationTest(unittest.TestCase):
    def test_invalid_batches_are_rejected(self):
        valid = {"id": "a", "type": "directa", "text": "¿Algo?"}
        cases = [
            {"questions": []},
            {"questions": [valid, dict(valid)]},
            {"questions": [{**valid, "text": "  "}]},
            {"questions": [{**valid, "type": "otra"}]},
            {"questions": [{**valid, "id": "Con Espacios"}]},
            {"questions": [valid], "parameters": {"top_k": 0}},
            {"questions": [valid], "parameters": {"chunk_words": 50, "overlap_words": 50}},
        ]
        for case in cases:
            with self.assertRaises(ValueError):
                rag.validate_spec(case)

    def test_default_parameters_are_applied(self):
        spec = rag.validate_spec({"questions": [{"id": "a", "type": "directa", "text": "¿Algo?"}]})
        self.assertEqual(spec["parameters"], rag.DEFAULT_PARAMETERS)

    def test_command_line_rejects_empty_question_before_loading_models(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "salida.json"
            with self.assertRaises(SystemExit) as error:
                rag.main(["--question", " ", "--output", str(output)])
            self.assertEqual(error.exception.code, 2)
            self.assertFalse(output.exists())

    def test_published_questions_are_valid(self):
        spec = json.loads((Path(__file__).parent / "questions.json").read_text(encoding="utf-8"))
        self.assertEqual({question["type"] for question in rag.validate_spec(spec)["questions"]},
                         set(rag.QUESTION_TYPES))


if __name__ == "__main__":
    unittest.main()
