import os

def check_bom(directory):
    for root, dirs, files in os.walk(directory):
        if 'node_modules' in dirs:
            dirs.remove('node_modules')
        for file in files:
            path = os.path.join(root, file)
            try:
                with open(path, 'rb') as f:
                    content = f.read(4)
                    if content.startswith(b'\xef\xbb\xbf'):
                        print(f"BOM found (UTF-8): {path}")
                    elif content.startswith(b'\xff\xfe') or content.startswith(b'\xfe\xff'):
                        print(f"BOM found (UTF-16): {path}")
            except Exception as e:
                pass

check_bom(r'C:\Users\cmanb\Desktop\Cleb Software\Chaos Engine Web\webapp')
