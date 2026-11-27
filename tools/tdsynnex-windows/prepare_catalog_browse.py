"""Prepare a guarded additive gateway patch. Does not import the gateway or open its database."""
import ast
import io
from pathlib import Path
import sys
import tokenize

BLOCK = '''        from catalog_inventory import handle_catalog_read
        inventory = handle_catalog_read(route.path, parse_qs(route.query, keep_blank_values=True), DB, category_where)
        if inventory is not None:
            return self.respond(*inventory)
'''


def patch_source(data):
    encoding, _ = tokenize.detect_encoding(io.BytesIO(data).readline)
    text = data.decode(encoding)
    tree = ast.parse(text)
    handlers = [n for c in tree.body if isinstance(c, ast.ClassDef) and c.name == 'Handler'
                for n in c.body if isinstance(n, ast.FunctionDef) and n.name == 'do_GET']
    if len(handlers) != 1:
        raise ValueError('Expected one catalog GET handler; nothing changed.')
    segment = ast.get_source_segment(text, handlers[0])
    auth = 'if not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + TOKEN):'
    marker = 'route = urlsplit(self.path)'
    if auth not in segment or marker not in segment or segment.index(auth) > segment.index(marker):
        raise ValueError('Authenticated gateway source did not match; nothing changed.')
    if 'handle_catalog_read' in text:
        if 'inventory = handle_catalog_read(route.path, parse_qs(route.query, keep_blank_values=True), DB, category_where)' not in text:
            raise ValueError('An unrecognized catalog extension is installed; nothing changed.')
        compile(text, '<existing gateway>', 'exec')
        return data
    newline = '\r\n' if '\r\n' in text else '\n'
    needle = '        route = urlsplit(self.path)' + newline
    if text.count(needle) != 1:
        raise ValueError('Expected a single gateway route dispatch; nothing changed.')
    updated = text.replace(needle, needle + BLOCK.replace('\n', newline), 1)
    compile(updated, '<candidate gateway>', 'exec')
    return updated.encode(encoding)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Provide source and candidate paths.')
    try:
        source, destination = map(Path, sys.argv[1:])
        if source.resolve() == destination.resolve():
            raise ValueError('Candidate must not overwrite the source.')
        destination.write_bytes(patch_source(source.read_bytes()))
        print('Authenticated additive gateway patch compiled: PASS')
    except (OSError, ValueError, SyntaxError, UnicodeError) as error:
        print('Patch not prepared:', str(error))
        raise SystemExit(1)
