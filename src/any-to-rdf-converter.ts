import {
  BasicRepresentation,
  InternalServerError,
  NotFoundHttpError,
  readableToString,
  Representation,
  RepresentationConverterArgs,
  TypedRepresentationConverter,
} from "@solid/community-server";
import fs from "fs-extra";
import { https } from "follow-redirects";

const RMLMapperWrapper = require("@rmlio/rmlmapper-java-wrapper");
const outputType = "text/turtle";
const FILE_NOT_FOUND = `Error: Error while executing the rules.`;

// Url to the latest release of rmlmapper.jar
const RMLMAPPER_LATEST = {
  host: "api.github.com",
  path: "/repos/rmlio/rmlmapper-java/releases/latest",
};

const getSourceName = (contentType: string) =>
  `data.${contentType.split("/")[1]}`;

export class AnyToRdfConverter extends TypedRepresentationConverter {
  private rmlRulesPath: string;
  private rmlmapperPath: string;

  public constructor(rmlRulesPath: string, rmlmapperPath: string) {
    super("application/json", outputType);

    this.rmlRulesPath = rmlRulesPath;
    this.rmlmapperPath = rmlmapperPath;
  }

  public async handle({
    identifier,
    representation,
  }: RepresentationConverterArgs): Promise<Representation> {
    if (representation.metadata.contentType === undefined)
      throw new InternalServerError("Content type can't be undefined");

    const data = await readableToString(representation.data);

    let rml;
    try {
      rml = await fs.readFile(this.rmlRulesPath, "utf-8");
    } catch (error) {
      if (error.code === "ENOENT")
        throw new InternalServerError("RML file is not found");
      else throw error;
    }

    const wrapper = new RMLMapperWrapper(this.rmlmapperPath, "./tmp", true);

    let result;
    try {
      result = await wrapper.execute(rml, {
        sources: { [getSourceName(representation.metadata.contentType)]: data },
        generateMetadata: false,
        serialization: "turtle",
      });
    } catch (error) {
      if (error.toString() === FILE_NOT_FOUND) {
        await this._download();
        result = await wrapper.execute(rml, {
          sources: {
            [getSourceName(representation.metadata.contentType)]: data,
          },
          generateMetadata: false,
          serialization: "turtle",
        });
      } else throw error;
    }

    return new BasicRepresentation(
      result.output,
      representation.metadata,
      outputType
    );
  }

  /**
   * Tries to download the latest release to the given path
   * @returns Promise of the GET
   */
  _download() {
    return new Promise((resolve) => {
      https
        .get(
          {
            host: RMLMAPPER_LATEST.host,
            path: RMLMAPPER_LATEST.path,
            headers: { "User-Agent": "RMLMapper downloader" },
          },
          (res) => {
            let jsonString = "";
            res.on("data", (d: string) => (jsonString += d));

            res.on("end", () => {
              const json = JSON.parse(jsonString);

              let i = 0;

              while (
                i < json.assets.length &&
                json.assets[i].browser_download_url.indexOf(".jar") === -1
              )
                i++;

              if (i < json.assets.length) {
                const file = fs.createWriteStream(this.rmlmapperPath);
                https.get(
                  json.assets[i].browser_download_url,
                  (response: {
                    pipe: (arg0: fs.WriteStream) => void;
                    on: (arg0: string, arg1: () => void) => void;
                  }) => {
                    response.pipe(file);

                    response.on("end", () => {
                      resolve(json.tag_name);
                    });
                  }
                );
              } else
                throw new NotFoundHttpError(
                  "No jar was found for the latest release. Please contact the developers."
                );
            });
          }
        )
        .on("error", (e: string | undefined) => {
          throw new InternalServerError(e);
        });
    });
  }
}
