# solid-store-rml

This repository handles RML-based operations, achieved through the usage of [rml.io](https://rml.io/).

## How to use

First install this repository as a dependency:

```bash
$ npm i git+https://gitlab.ilabt.imec.be/KNoWS/solid-store-rml.git
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
      "@id": "solid-store-rml:JsonToRdfConverter",
      "JsonToRdfConverter:_rmlRulesPath": [path to the rules file],
      "JsonToRdfConverter:_rmlmapperPath": [path to the jar]
    },
]
```

## json-to-rdf-converter

Converts a JSON object to it's RDF representation, according to the RML defined in a given rules file. If the `rmlmapper.jar` isn't found at the given location, then the converter tries to download it to that location.  
Beware that this jar is approx. 60MB, thus that this download can take some time.

## yarrrml

The rml rules are generated from the structure defined in the `.yarrrml` file. See [the specification](https://rml.io/yarrrml/spec/) for more information on what each field entails. [Matey](https://rml.io/yarrrml/matey/) is also a tool which can be used to generate these rules.
