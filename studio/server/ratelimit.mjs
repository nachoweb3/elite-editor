// Small in-memory token bucket. The studio listens on loopback, so this is not
// a public gateway; it exists so a stuck tab, a script or a runaway poller
// cannot saturate the render queue or turn the API into a denial of service.
const buckets=new Map();

export function hit(key,limit=1200,windowMs=60_000){
  const now=Date.now();
  let bucket=buckets.get(key);
  if(!bucket||now>=bucket.reset){
    bucket={count:0,reset:now+windowMs};
    buckets.set(key,bucket);
  }
  bucket.count++;
  if(bucket.count<=limit)return {ok:true,remaining:limit-bucket.count};
  return {ok:false,retryAfter:Math.max(1,Math.ceil((bucket.reset-now)/1000))};
}

export function forget(key){
  buckets.delete(key);
}

const cleanup=setInterval(()=>{
  const now=Date.now();
  for(const [key,bucket] of buckets)if(now>=bucket.reset)buckets.delete(key);
},5*60*1000);
cleanup.unref?.();
