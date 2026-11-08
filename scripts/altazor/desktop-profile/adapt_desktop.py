"""Apply the bounded reader to the separately archived desktop source, never a user's profile."""
import importlib.util
import json
from pathlib import Path
import sys


def adapt_page(source):
    start = source.index('READ_JS = r"""')
    end = source.index('# Finds the element to act on:')
    browser = Path(__file__).with_name('browser-read.js').read_text(encoding='utf-8')
    options = dict(offset=0, limit=6000, query='', elementOffset=0, elementLimit=40)
    expression = '(() => { const v = (' + browser + ')(' + json.dumps(options) + '); return {...v,items:v.items.map(i=>({n:i.ref,tag:i.role,label:i.label,...(i.url?{href:i.url}:{}),disabled:i.disabled,checked:i.checked}))}; })()'
    source = source[:start] + 'READ_JS = ' + repr(expression) + '\n\n' + source[end:]
    start = source.index('    def __init__(self):\n')
    end = source.index('    def call(self, method, **params):', start)
    constructor = '''    def __init__(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location('lexopen_reader', '/usr/local/lib/lexopen-reading/reading.py')
        reader = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(reader)
        selected = reader.active_page()
        self.ws, self.id = selected.ws, selected.id

'''
    return '# LexOpen bounded semantic reader adaptation (original source license retained).\n' + source[:start] + constructor + source[end:]


if __name__ == '__main__':
    context = Path(sys.argv[1]).resolve(strict=True)
    file = context / 'kitty-page.py'
    source = file.read_text(encoding='utf-8')
    if 'LexOpen bounded semantic reader adaptation' in source:
        raise ValueError('Reading adaptation was already applied')
    file.write_text(adapt_page(source), encoding='utf-8')
