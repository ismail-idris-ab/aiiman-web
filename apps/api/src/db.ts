import { MongoClient } from "mongodb";

let client: MongoClient | undefined;
let clientUri: string | undefined;

/** One client per instance: Fluid Compute reuses instances across requests, so the pool is shared. */
export function getClient(uri: string): MongoClient {
  if (client === undefined || clientUri !== uri) {
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 3000,
      maxPoolSize: 5,
    });
    clientUri = uri;
  }
  return client;
}

export async function pingDatabase(uri: string): Promise<boolean> {
  await getClient(uri).db("admin").command({ ping: 1 });
  return true;
}
