import {GeospatialIndex} from "@convex-dev/geospatial";
import {components} from "./_generated/api";
import type {Id} from "./_generated/dataModel";
export const geo=new GeospatialIndex<Id<"prospects">,{ownerId:string;trade:string}>(components.geospatial);
