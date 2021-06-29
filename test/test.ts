import { expect } from "chai";
import { JsonToRdfConverter } from "../src/json-to-rdf-converter";

import {
  guardedStreamFrom,
  RepresentationMetadata,
  readableToString,
  BadRequestHttpError,
  InternalServerError,
} from "@solid/community-server";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";

chai.use(chaiAsPromised);

/**
 * Converts an input (typically JSON) to RDF and converts the stream to string
 * @param input - Input to convert to RDF
 * @returns Converted input in string format
 */
const convertToRDF = async (input: any): Promise<any> => {
  const inputStream = guardedStreamFrom(JSON.stringify(input));
  const outputStream = await new JsonToRdfConverter(
    "./test/events.rml.ttl",
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

  it("Verify converter on correct input", async () => {
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

    const data = await convertToRDF(input);

    expect(data).equal(expectedResult);
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

      const data = await convertToRDF(input);

      expect(data).equal(expectedResult);
    });

    it("#2 - 500", async () => {
      const input = [{}];

      await expect(convertToRDF(input))
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

      await expect(convertToRDF(input))
        .to.eventually.be.rejectedWith(
          "Could not convert the input to valid RDF"
        )
        .and.be.an.instanceOf(InternalServerError);
    });

    it("#4 - 400", async () => {
      await expect(
        new JsonToRdfConverter(
          "./test/events.rml.ttl",
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
  });
});
