import {
  BadRequestHttpError,
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
const RMLMAPPER_LATEST = {
  host: "api.github.com",
  path: "/repos/rmlio/rmlmapper-java/releases/latest",
};
// "https://api.github.com/repos/rmlio/rmlmapper-java/releases/latest";

export class JsonToRdfConverter extends TypedRepresentationConverter {
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
    const data = await readableToString(representation.data);

    if (!data.trim().length)
      throw new BadRequestHttpError("Empty input is not allowed");

    const rml = await fs.readFile(this.rmlRulesPath, "utf-8");

    if (!fs.existsSync(this.rmlmapperPath)) await this._download();

    const wrapper = new RMLMapperWrapper(this.rmlmapperPath, "./tmp", true);
    const result = await wrapper.execute(rml, {
      sources: { "data.json": data },
      generateMetadata: false,
      serialization: "turtle",
    });

    if (!result.output.trim().length)
      throw new InternalServerError("Could not convert the input to valid RDF");

    return new BasicRepresentation(
      result.output,
      representation.metadata,
      outputType
    );
  }

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
