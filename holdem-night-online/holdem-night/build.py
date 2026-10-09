eng = open('engine.js').read().replace("require('crypto').webcrypto", "null")
html = open('client.html').read().replace('/*ENGINE*/', eng)
open('public/index.html', 'w').write('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + html + '</body></html>')
