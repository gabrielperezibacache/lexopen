"""Offline regressions for bounded workspace extraction; never reads user data."""
import importlib.util
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('reader', Path(__file__).with_name('desktop-profile') / 'reading.py')
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


def options(path, **changes):
    return dict(path=path, offset=0, limit=1000, query='', elementOffset=0, elementLimit=40, **changes)


class WorkspaceReading(unittest.TestCase):
    def test_plain_text_has_continuation_and_literal_search(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            content = 'Primera línea\n' + 'Texto de prueba\n' * 170 + 'FINAL_SENTINEL'
            (root / 'selected.txt').write_text(content, encoding='utf-8')
            first = reader.read_document(options('selected.txt'), root)
            second = reader.read_document({**options('selected.txt'), 'offset': first['nextOffset']}, root)
            self.assertEqual(first['text'] + second['text'], content[:2000])
            found = reader.read_document({**options('selected.txt'), 'query': 'FINAL_SENTINEL'}, root)
            self.assertEqual(found['text'], 'FINAL_SENTINEL')
            self.assertIsNone(found['nextOffset'])

    def test_paths_hidden_files_and_symlinks_fail_closed(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            root = base / 'work'; root.mkdir()
            (base / 'secret.txt').write_text('OUTSIDE_SENTINEL')
            (root / '.browser').mkdir(); (root / '.browser' / 'Cookies').write_text('COOKIE_SENTINEL')
            (root / 'link.txt').symlink_to(base / 'secret.txt')
            (root / 'directory').symlink_to(base, target_is_directory=True)
            for path in ['../secret.txt', str(base / 'secret.txt'), '.browser/Cookies', 'link.txt', 'directory/secret.txt']:
                with self.subTest(path=path), self.assertRaises((reader.ReadingError, OSError, ValueError)):
                    reader.read_document(options(path), root)
            with self.assertRaises(OSError):
                reader.open_document('link.txt', root)

    def test_office_spans_and_bounded_archives(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with zipfile.ZipFile(root / 'selected.odt', 'w') as archive:
                archive.writestr('content.xml', '<document><p>Texto <span>con formato</span> completo.</p></document>')
            result = reader.read_document(options('selected.odt'), root)
            self.assertEqual(result['method'], 'office-text')
            self.assertEqual(result['text'], 'Texto con formato completo.')
            with zipfile.ZipFile(root / 'too-many.docx', 'w') as archive:
                for index in range(2001):
                    archive.writestr(str(index), '')
            with self.assertRaises(reader.ReadingError):
                reader.read_document(options('too-many.docx'), root)
            with zipfile.ZipFile(root / 'external.docx', 'w') as archive:
                archive.writestr('word/document.xml', '<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]><document><t>&x;</t></document>')
            with self.assertRaises(reader.ReadingError):
                reader.read_document(options('external.docx'), root)

    def test_imported_documents_keep_their_verified_hash_binding(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = b'Verified selected file'
            digest = hashlib.sha256(data).hexdigest()
            folder = root / 'imports' / digest; folder.mkdir(parents=True)
            file = folder / 'fixture.txt'; file.write_bytes(data)
            relative = f'imports/{digest}/fixture.txt'
            self.assertEqual(reader.read_document(options(relative), root)['text'], data.decode())
            file.write_bytes(b'CHANGED_CONTENT_MUST_NOT_BE_RETURNED')
            with self.assertRaises(reader.ReadingError):
                reader.read_document(options(relative), root)


if __name__ == '__main__':
    unittest.main()
