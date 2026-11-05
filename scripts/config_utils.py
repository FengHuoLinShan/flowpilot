"""Read this project's dotenv output without executing shell code.

Bootstrap emits double-quoted, escaped literal values. This intentionally isn't
an arbitrary shell evaluator and does not expand user-authored ${VARIABLE} syntax.
"""
from pathlib import Path


def read_env(path: Path) -> dict[str,str]:
    result={}
    for number, raw in enumerate(path.read_text(encoding='utf-8').splitlines(),1):
        line=raw.strip()
        if not line or line.startswith('#'):
            continue
        key,sep,value=line.partition('=')
        if not sep or not key.replace('_','').isalnum():
            raise ValueError(f'Invalid configuration syntax at line {number}.')
        value=value.strip()
        if value.startswith("'"):
            if not value.endswith("'"):
                raise ValueError(f'Unterminated configuration value at line {number}.')
            value=value[1:-1]
            # Compose single-quoted values retain backslashes except escaped apostrophes.
            value=value.replace("\\'", "'")
        elif value.startswith('"'):
            if not value.endswith('"'):
                raise ValueError(f'Unterminated configuration value at line {number}.')
            quoted=value[1:-1]
            chars=[]; i=0
            escapes={'\\':'\\','"':'"','n':'\n','r':'\r','t':'\t'}
            while i<len(quoted):
                if quoted[i]=='\\' and i+1<len(quoted) and quoted[i+1] in escapes:
                    chars.append(escapes[quoted[i+1]]);i+=2
                elif quoted[i:i+2]=='$$':
                    chars.append('$');i+=2
                else:
                    chars.append(quoted[i]);i+=1
            value=''.join(chars)
        result[key.strip()]=value
    return result
