import os
path = r'c:/Users/Dell/Desktop/drips/tikka/client/src/pages/Home.tsx'
content = open(path, 'r').read()
print('Current file has', len(content), 'chars')
print('First JSX error char:', repr(content[5900:6100]))
