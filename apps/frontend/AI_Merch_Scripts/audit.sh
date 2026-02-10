#!/bin/bash
# This is a shebang - it tells the computer to use the Bash shell to run this.

echo "--- PROJECT MAP ---"
# If 'tree' isn't installed, you can use 'ls -R' but tree is better.
tree -I 'node_modules|.next|.git'

echo -e "\n--- ROOT LAYOUT ---"
cat src/app/layout.tsx

echo -e "\n--- PAGE REGISTRY ---"
find src/app -name "page.tsx" -exec echo -e "\nFILE: {}" \; -exec cat {} \;
