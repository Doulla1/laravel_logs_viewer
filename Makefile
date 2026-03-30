.PHONY: all

all:
	npm install
	npm run validate
	npm run package:vsix
