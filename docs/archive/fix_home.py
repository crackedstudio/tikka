import os

path = r'c:/Users/Dell/Desktop/drips/tikka/client/src/pages/Home.tsx'

with open(path, 'r') as f:
    content = f.read()

print("Current file length:", len(content))
print("---")

# Find the corrupted section
idx = content.find('{!hasMore')
print("hasMore section at:", idx)
if idx > 0:
    print(repr(content[idx-50:idx+300]))

# Check for missing closing div
last_div = content.rfind('</div>')
print("Last </div> at:", last_div)
print("After last </div>:", repr(content[last_div:last_div+100]))

# Check for the outer wrapper div
outer_open = content.find('<div className="bg-gray-50')
print("Outer div at:", outer_open)
