import {
  BaseTypedRepresentationConverter,
  BasicRepresentation,
  InternalServerError,
  NotFoundHttpError,
  readableToString,
  Representation,
  RepresentationConverterArgs
} from "@solid/community-server";
import fs from "fs-extra";
import {https} from "follow-redirects";

const crypto = require('crypto');
const humanToMilliseconds = require('human-to-milliseconds')

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

export class AnyToRdfConverter extends BaseTypedRepresentationConverter {
  private readonly rmlRulesPath: string;
  private readonly rmlmapperPath: string;
  private readonly cache: { [key: string]: any } | null;
  private readonly cacheRetention: number | undefined;
  private intervalID: NodeJS.Timer | undefined;

  public constructor(rmlRulesPath: string, rmlmapperPath: string, cache?: boolean, cacheRetention?: string, cacheCleanUp?: string) {
    super("application/json", outputType);

    this.rmlRulesPath = rmlRulesPath;
    this.rmlmapperPath = rmlmapperPath;
    this.cache = cache ? {} : null;
    cacheCleanUp = cacheCleanUp || '1m';

    if (this.cache && cacheRetention !== 'infinity') {
      this.cacheRetention = humanToMilliseconds(cacheRetention || '15m');
      this.intervalID = setInterval(this._cleanUpCache.bind(this), humanToMilliseconds(cacheCleanUp));
    }
  }

  public async handle({
                        identifier,
                        representation,
                      }: RepresentationConverterArgs): Promise<Representation> {
    if (representation.metadata.contentType === undefined)
      throw new InternalServerError("Content type can't be undefined");

    const data = await readableToString(representation.data);
    let rdf = this._getRDFFromCache(data);

    if (!rdf) {
      let rml;
      try {
        rml = await fs.readFile(this.rmlRulesPath, "utf-8");
      } catch (error: any) {
        if (error.code === "ENOENT")
          throw new InternalServerError("RML file is not found");
        else throw error;
      }

      const wrapper = new RMLMapperWrapper(this.rmlmapperPath, "./tmp", true);

      let result;
      try {
        result = await wrapper.execute(rml, {
          sources: {[getSourceName(representation.metadata.contentType)]: data},
          generateMetadata: false,
          serialization: "turtle",
        });
      } catch (error: any) {
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

      rdf = result.output;
    }

    if (!rdf) {
      throw new Error(`AnyToRdfConverter: RDF is ${rdf}.`);
    }

    this._setRDFinCache(data, rdf);

    return new BasicRepresentation(
      rdf,
      representation.metadata,
      outputType
    );
  }

  /**
   * Get RDF from the cache.
   * @param data - The data to use to determine the hash for the caching.
   */
  _getRDFFromCache(data: string) {
    if (this.cache) {
      const hash: string = crypto.createHash('md5').update(data).digest("hex");
      if (!this.cache[hash]) {
        return null;
      }

      const {rdf} = this.cache[hash];

      if (rdf) {
        this.cache[hash].lastUsed = new Date();
        console.log(`AnyToRdfConverter: Use RDF from cache for hash ${hash}`);
      }

      return rdf;
    }

    return null;
  }

  /**
   * Store RDF in the cache.
   * @param data - The data that is used to determine to hash for caching.
   * @param rdf - The RDF that is stored.
   */
  _setRDFinCache(data: string, rdf: string) {
    if (this.cache) {
      const hash: string = crypto.createHash('md5').update(data).digest("hex");
      this.cache[hash] = {rdf, lastUsed: new Date()};
    }
  }

  /**
   * This method removes RDF from the cache that hasn't been used in a while.
   * This is based on this.cacheRetention.
   */
  _cleanUpCache() {
    const now = (new Date()).getTime();
    // @ts-ignore
    const hashes = Object.keys(this.cache);
    // @ts-ignore
    const usedAfter = now - this.cacheRetention;

    hashes.forEach(hash => {
      // @ts-ignore
      const value = this.cache[hash];
      const lastUsed = value.lastUsed.getTime();

      if (lastUsed < usedAfter) {
        console.log(`AnyToRdfConverter: Removing RDF for hash ${hash}`);
        // @ts-ignore
        delete this.cache[hash];
      }
    });
  }

  /**
   * This method stops the automatic clean up of the cache.
   */
  stopCacheCleanUps() {
    if (this.intervalID) {
      clearInterval(this.intervalID);
    }
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
            headers: {"User-Agent": "RMLMapper downloader"},
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
