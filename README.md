# Solid RML Store

This Solid store allows you to generate RDF through the use of RML rules.

## How to use

First install this repository as a dependency:

```bash
$ npm i @rmlio/solid-rml-store
```

Then add the following lines to your config:

```json
"@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/solid-store-rml/^0.0.0/components/context.jsonld",
    {
      "solid-store-rml": "urn:solid-store-rml:default"
    }
  ],
"import": [
    "files-ssr:config/default.json"
  ],
"@graph": [
    {
      "@id": "solid-store-rml:AnyToRdfConverter",
      "AnyToRdfConverter:_rmlRulesPath": [path to the rules file],
      "AnyToRdfConverter:_rmlmapperPath": [path to the jar]
    },
]
```

## AnyToRdfConverter

This converter converts an existing representation to its RDF representation, 
according to the RML rules defined in a given file (`AnyToRdfConverter:_rmlRulesPath`). 
The `content-type` defined in the representation's metadata is used to know the type of the input data, 
thus this cannot be `undefined`.

If the RMLMapper (`rmlmapper.jar`) is not found at the given location (`AnyToRdfConverter:_rmlmapperPath`),
then the latest version is download to that location.
Beware that this jar is approximately 60MB, thus this download can take some time.