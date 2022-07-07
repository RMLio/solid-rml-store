import { expect } from "chai";
import { AnyToRdfConverter } from "../src";

import {
  guardedStreamFrom,
  RepresentationMetadata,
  readableToString,
  InternalServerError,
} from "@solid/community-server";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import fs from "fs-extra";
import sinon from 'sinon';
chai.use(chaiAsPromised);

/**
 * Converts a JSON input to RDF and converts the stream to string.
 * @param input - JSON to convert to RDF.
 * @param converter - AnyToRdfConverter you want to reuse. If not provided a new one is created.
 * @returns Converted input in string format.
 */
const convertJsonToRDF = async (input: any, converter?: AnyToRdfConverter): Promise<any> => {
  const inputStream = guardedStreamFrom(JSON.stringify(input));
  converter = converter || new AnyToRdfConverter(
    "./test/events/events.rml.ttl",
    "./rmlmapper.jar"
  );
  const outputStream = await converter.handle({
    identifier: { path: "json" },
    representation: {
      metadata: new RepresentationMetadata("application/json"),
      data: inputStream,
      binary: false,
      isEmpty: false
    },
    preferences: {},
  });
  return await readableToString(outputStream.data);
};

const inputJson = {
  name: "Test for Solid calendar",
  events: [
    {
      title: "Correctly converted",
      startDate: "2021-04-08T15:00:00.000Z",
      endDate: "2021-04-08T17:00:00.000Z",
    },
  ],
};
const expectedResultFromJson = `
<http://example.com/calendar/Test%20for%20Solid%20calendar> <http://schema.org/event>
    <http://example.com/event/Correctly%20converted>;
  <http://schema.org/name> "Test for Solid calendar" .

<http://example.com/event/Correctly%20converted> a <http://schema.org/Date>;
  <http://schema.org/endDate> "2021-04-08T17:00:00.000Z";
  <http://schema.org/name> "Correctly converted";
  <http://schema.org/startDate> "2021-04-08T15:00:00.000Z" .\n`;

describe("JsonToRdfConverter", function () {
  this.timeout(20*1000);

  describe("Verify convertor on correct input", () => {
    const consoleLogStub = sinon.stub(console, 'log');

    it("JSON", async () => {
      const data = await convertJsonToRDF(inputJson);

      expect(data).equal(expectedResultFromJson);
    });

    it("CSV", async () => {
      const expectedResult = `
<http://example.com/movie/fotr> a <http://schema.org/Movie>;
  <http://example.com/year> "2001";
  <http://schema.org/name> "The Fellowship of the Ring" .

<http://example.com/movie/sw> a <http://schema.org/Movie>;
  <http://example.com/year> "1977";
  <http://schema.org/name> "Star Wars" .

<http://example.com/movie/wam> a <http://schema.org/Movie>;
  <http://example.com/year> "2006";
  <http://schema.org/name> "We Are Marshall" .\n`;

      const outputStream = await new AnyToRdfConverter(
        "./test/movies/movies.rml.ttl",
        "./rmlmapper.jar"
      ).handle({
        identifier: { path: "csv" },
        representation: {
          metadata: new RepresentationMetadata("text/csv"),
          data: guardedStreamFrom(
            await fs.readFile("./test/movies/movies.csv")
          ),
          binary: false,
          isEmpty: false
        },
        preferences: {},
      });
      const data = await readableToString(outputStream.data);

      expect(data).equal(expectedResult);
    });

    it("JSON with cache", async () => {
      const converter = new AnyToRdfConverter(
        "./test/events/events.rml.ttl",
        "./rmlmapper.jar",
        true,
        'infinity'
      );
      const data = await convertJsonToRDF(inputJson, converter);
      expect(data).equal(expectedResultFromJson);
      const data2 = await convertJsonToRDF(inputJson, converter);
      expect(data2).equal(expectedResultFromJson);
      expect(consoleLogStub.withArgs(`AnyToRdfConverter: Use RDF from cache for hash 0dece66c971f9ad34333f6e97d5fd3ab`).callCount ).to.equal(1);
      converter.stopCacheCleanUps();
    });

    it("Clean up cache", async () => {
      const converter = new AnyToRdfConverter(
        "./test/events/events.rml.ttl",
        "./rmlmapper.jar",
        true,
        '6s',
        '5s'
      );
      const data = await convertJsonToRDF(inputJson, converter);
      expect(data).equal(expectedResultFromJson);
      await sleep(13*1000)
      expect(consoleLogStub.withArgs(`AnyToRdfConverter: Removing RDF for hash 0dece66c971f9ad34333f6e97d5fd3ab`).callCount ).to.equal(1);
      converter.stopCacheCleanUps();
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
            isEmpty: false
          },
          preferences: {},
        })
      )
        .to.eventually.be.rejectedWith("Content type can't be undefined")
        .and.be.an.instanceOf(InternalServerError);
    });

    it("#3 - 500", async () => {
      await expect(
        new AnyToRdfConverter(
          "./test/non-existent.rml.ttl",
          "./rmlmapper.jar"
        ).handle({
          identifier: { path: "json" },
          representation: {
            metadata: new RepresentationMetadata('application/json'),
            data: guardedStreamFrom(""),
            binary: false,
            isEmpty: false
          },
          preferences: {},
        })
      )
        .to.eventually.be.rejectedWith("RML file is not found")
        .and.be.an.instanceOf(InternalServerError);
    });
  });
});

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
