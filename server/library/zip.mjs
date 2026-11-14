// Minimal ZIP reader (stored + deflate). Used to take one texture out of a provider's
// zip without unpacking to disk, so a hostile archive cannot write outside our folder.
import zlib from 'node:zlib';

const MAX_ENTRY=96*1024*1024;
export function readZip(buffer){
 const eocd=buffer.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
 if(eocd<0)throw new Error('Archivo zip no válido');
 const total=buffer.readUInt16LE(eocd+10),directory=buffer.readUInt32LE(eocd+16);
 if(total===0xffff||directory===0xffffffff)throw new Error('Zip64 no admitido');
 const entries=[];let at=directory;
 for(let i=0;i<total;i++){
  if(buffer.readUInt32LE(at)!==0x02014b50)throw new Error('Directorio zip dañado');
  const method=buffer.readUInt16LE(at+10),compressed=buffer.readUInt32LE(at+20),size=buffer.readUInt32LE(at+24);
  const nameLength=buffer.readUInt16LE(at+28),extraLength=buffer.readUInt16LE(at+30),commentLength=buffer.readUInt16LE(at+32),offset=buffer.readUInt32LE(at+42);
  entries.push({name:buffer.toString('utf8',at+46,at+46+nameLength),method,compressed,size,offset});
  at+=46+nameLength+extraLength+commentLength;
 }
 return entries;
}
export function extractEntry(buffer,entry){
 if(entry.size>MAX_ENTRY)throw new Error('El archivo del zip es demasiado grande');
 if(buffer.readUInt32LE(entry.offset)!==0x04034b50)throw new Error('Entrada zip dañada');
 const start=entry.offset+30+buffer.readUInt16LE(entry.offset+26)+buffer.readUInt16LE(entry.offset+28);
 const data=buffer.subarray(start,start+entry.compressed);
 const out=entry.method===0?data:entry.method===8?zlib.inflateRawSync(data,{maxOutputLength:MAX_ENTRY}):null;
 if(!out)throw new Error('Método de compresión zip no admitido');
 if(out.length!==entry.size)throw new Error('El tamaño del archivo del zip no coincide');
 return out;
}
