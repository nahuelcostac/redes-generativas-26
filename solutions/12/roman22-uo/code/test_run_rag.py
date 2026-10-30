import unittest

from run_rag import split_document


class ChunkingTests(unittest.TestCase):
    def test_preserves_text_and_overlaps_windows(self):
        source = {'id': 'doc', 'title': 'Documento', 'source': 'prueba',
                  'text': ' '.join(f'palabra{i}' for i in range(90))}
        chunks = split_document(source)
        self.assertEqual(len(chunks), 3)
        self.assertEqual(chunks[0]['text'].split()[-10:], chunks[1]['text'].split()[:10])
        self.assertEqual(chunks[1]['text'].split()[-10:], chunks[2]['text'].split()[:10])
        self.assertEqual(chunks[0]['document_title'], 'Documento')

    def test_empty_document_yields_no_chunks(self):
        source = {'id': 'vacio', 'title': 'Vacío', 'source': 'prueba', 'text': ''}
        self.assertEqual(split_document(source), [])


if __name__ == '__main__':
    unittest.main()
