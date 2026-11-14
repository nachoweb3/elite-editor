import {openverse,commons,ambientcg,polyhaven} from './open.mjs';
import {pexels,pixabay,freesound,giphy,googlefonts} from './keyed.mjs';
import {kenney,iconstash,mixkit,svgrepo,memevault,memescreens,usesounds,opengameart,lottiefiles} from './manual.mjs';

// Priority sources first (open licences and documented APIs), then secondary ones.
export const CONNECTORS=[
 kenney,iconstash,openverse,commons,pixabay,pexels,freesound,giphy,ambientcg,polyhaven,
 mixkit,svgrepo,memevault,memescreens,usesounds,opengameart,googlefonts,lottiefiles,
];
export const connectorById=id=>CONNECTORS.find(c=>c.id===id)||null;

/** Public metadata only: never functions, never keys. */
export function describeConnector(connector,{configured={}}={}){
 const {id,name,tier,mode,homepage,kinds,formats,auth,attribution,license,restrictions,limits,credit,requiresAck,manual}=connector;
 return {id,name,tier,mode,homepage,kinds,formats,auth,configured:auth.type==='key'?!!configured[auth.keyName]:true,attribution,license,restrictions,limits,credit,requiresAck,manual};
}
export const describeConnectors=options=>CONNECTORS.map(c=>describeConnector(c,options));
