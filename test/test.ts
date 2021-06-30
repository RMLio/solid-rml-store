import { expect } from "chai";
import { AnyToRdfConverter } from "../src/any-to-rdf-converter";

import {
  guardedStreamFrom,
  RepresentationMetadata,
  readableToString,
  BadRequestHttpError,
  InternalServerError,
} from "@solid/community-server";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import fs from "fs-extra";
chai.use(chaiAsPromised);

/**
 * Converts a JSON input to RDF and converts the stream to string
 * @param input - JSON to convert to RDF
 * @returns Converted input in string format
 */
const convertJsonToRDF = async (input: any): Promise<any> => {
  const inputStream = guardedStreamFrom(JSON.stringify(input));
  const outputStream = await new AnyToRdfConverter(
    "./test/events/events.rml.ttl",
    "./rmlmapper.jar"
  ).handle({
    identifier: { path: "json" },
    representation: {
      metadata: new RepresentationMetadata("json"),
      data: inputStream,
      binary: false,
    },
    preferences: {},
  });
  return await readableToString(outputStream.data);
};

describe("JsonToRdfConverter", function () {
  this.timeout(10000);

  describe("Verify convertor on correct input", () => {
    it("#1 - json", async () => {
      const input = {
        name: "Test for Solid calendar",
        events: [
          {
            title: "Correctly converted",
            startDate: "2021-04-08T15:00:00.000Z",
            endDate: "2021-04-08T17:00:00.000Z",
          },
        ],
      };
      const expectedResult = `
<http://example.com/calendar/Test%20for%20Solid%20calendar> <http://schema.org/event>
    <http://example.com/event/Correctly%20converted>;
  <http://schema.org/name> "Test for Solid calendar" .

<http://example.com/event/Correctly%20converted> a <http://schema.org/Date>;
  <http://schema.org/endDate> "2021-04-08T17:00:00.000Z";
  <http://schema.org/name> "Correctly converted";
  <http://schema.org/startDate> "2021-04-08T15:00:00.000Z" .\n`;

      const data = await convertJsonToRDF(input);

      expect(data).equal(expectedResult);
    });

    it("#2 - csv", async () => {
      const expectedResult = `
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.
@prefix ma: <http://www.w3.org/ns/ma-ont#>.
@prefix schema: <http://schema.org/>.
@prefix ex: <http://example.com/>.

<http://example.com/movie/sw> a schema:Movie;
    schema:name "Star Wars";
    ex:year "1977".
<http://example.com/movie/fotr> a schema:Movie;
    schema:name "The Fellowship of the Ring";
    ex:year "2001".
<http://example.com/movie/wam> a schema:Movie;
    schema:name "We Are Marshall";
    ex:year "2006".\n`;

      const outputStream = await new AnyToRdfConverter(
        "./test/events/events.rml.ttl",
        "./rmlmapper.jar"
      ).handle({
        identifier: { path: "csv" },
        representation: {
          metadata: new RepresentationMetadata("csv"),
          data: guardedStreamFrom(
            await fs.readFile("./test/movies/movies.csv")
          ),
          binary: false,
        },
        preferences: {},
      });
      const data = await readableToString(outputStream.data);

      expect(data).equal(expectedResult);
    });
  });

  describe("Verify convertor on incorrect input", () => {
    it("#1 - Partially correct input shouldn't crash the convertor", async () => {
      const input = {
        name: "Test for Solid calendar",
        events: [
          {
            title: "Correctly converted",
          },
        ],
        abcdef: "0123456",
      };
      const expectedResult = `
<http://example.com/calendar/Test%20for%20Solid%20calendar> <http://schema.org/event>
    <http://example.com/event/Correctly%20converted>;
  <http://schema.org/name> "Test for Solid calendar" .

<http://example.com/event/Correctly%20converted> a <http://schema.org/Date>;
  <http://schema.org/name> "Correctly converted" .\n`;

      const data = await convertJsonToRDF(input);

      expect(data).equal(expectedResult);
    });

    it("#2 - 500", async () => {
      const input = [{}];

      await expect(convertJsonToRDF(input))
        .to.eventually.be.rejectedWith(
          "Could not convert the input to valid RDF"
        )
        .and.be.an.instanceOf(InternalServerError);
    });

    it("#3 - 500", async () => {
      const input = [
        {
          abcdef: "Random field",
        },
      ];

      await expect(convertJsonToRDF(input))
        .to.eventually.be.rejectedWith(
          "Could not convert the input to valid RDF"
        )
        .and.be.an.instanceOf(InternalServerError);
    });

    it("#4 - 400", async () => {
      await expect(
        new AnyToRdfConverter(
          "./test/events/events.rml.ttl",
          "./rmlmapper.jar"
        ).handle({
          identifier: { path: "json" },
          representation: {
            metadata: new RepresentationMetadata("json"),
            data: guardedStreamFrom(""),
            binary: false,
          },
          preferences: {},
        })
      )
        .to.eventually.be.rejectedWith("Empty input is not allowed")
        .and.be.an.instanceOf(BadRequestHttpError);
    });

    it("#5 - 500", async () => {
      await expect(
        new AnyToRdfConverter(
          "./test/events/events.rml.ttl",
          "./rmlmapper.jar"
        ).handle({
          identifier: { path: "json" },
          representation: {
            metadata: new RepresentationMetadata(undefined),
            data: guardedStreamFrom(""),
            binary: false,
          },
          preferences: {},
        })
      )
        .to.eventually.be.rejectedWith("Content type can't be undefined")
        .and.be.an.instanceOf(InternalServerError);
    });
  });
});
