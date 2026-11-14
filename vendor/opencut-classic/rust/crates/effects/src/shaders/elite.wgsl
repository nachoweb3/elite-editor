struct VertexOutput { @builtin(position) position: vec4f, @location(0) tex_coord: vec2f }
struct EffectUniforms { resolution: vec2f, direction: vec2f, scalars: vec4f, extra: vec4f }
@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> u: EffectUniforms;
fn chroma(c:vec3f)->vec2f { return vec2f(dot(c,vec3f(-0.168736,-0.331264,0.5)),dot(c,vec3f(0.5,-0.418688,-0.081312))); }
@fragment fn fragment_main(input:VertexOutput)->@location(0) vec4f {
 let mode=i32(u.scalars.x); let amount=u.scalars.y;
 var uv=input.tex_coord;
 if(mode==5){let cells=max(vec2f(1.0),u.resolution/max(amount,1.0));uv=(floor(uv*cells)+0.5)/cells;}
 let source=textureSample(input_texture,input_sampler,uv);var c=source.rgb;var alpha=source.a;
 if(mode==0){c=c*exp2(amount);c=(c-0.5)*u.scalars.z+0.5;let l=dot(c,vec3f(0.2126,0.7152,0.0722));c=mix(vec3f(l),c,u.scalars.w);}
 if(mode==1){let l=dot(c,vec3f(0.2126,0.7152,0.0722));c=mix(c,vec3f(l),amount);}
 if(mode==2){let sepia=vec3f(dot(c,vec3f(0.393,0.769,0.189)),dot(c,vec3f(0.349,0.686,0.168)),dot(c,vec3f(0.272,0.534,0.131)));c=mix(c,sepia,amount);}
 if(mode==3){c=mix(c,1.0-c,amount);}
 if(mode==4){let d=length((uv-0.5)*vec2f(1.0,1.0));c=c*(1.0-amount*smoothstep(0.2,0.7,d));}
 if(mode==6){let key=u.extra.rgb;let distance=length(chroma(c)-chroma(key));let keep=smoothstep(amount,amount+max(u.scalars.z,0.001),distance);alpha=alpha*keep;
   let spill=u.scalars.w*(1.0-keep);if(key.g>key.r&&key.g>key.b){c.g=mix(c.g,min(c.g,max(c.r,c.b)),spill);}if(key.b>key.r&&key.b>key.g){c.b=mix(c.b,min(c.b,max(c.r,c.g)),spill);}
 }
 if(mode==7){c=c+vec3f(amount*0.12,0.0,-amount*0.12);}
 if(mode==8){let t=1.0/u.resolution;let around=textureSample(input_texture,input_sampler,uv+vec2f(t.x,0.0)).rgb+textureSample(input_texture,input_sampler,uv-vec2f(t.x,0.0)).rgb+textureSample(input_texture,input_sampler,uv+vec2f(0.0,t.y)).rgb+textureSample(input_texture,input_sampler,uv-vec2f(0.0,t.y)).rgb;c=c+amount*(4.0*c-around);}
 // Local, edge-aware portrait finish. Ellipse is user positioned, not face tracking.
 if(mode==9){
   let radius=max(u.extra.zw*0.5,vec2f(0.01));
   let distance=length((uv-u.extra.xy)/radius);
   let mask=1.0-smoothstep(0.65,1.0,distance);
   let step=max(vec2f(1.0),u.resolution/400.0)/u.resolution;
   var average=vec3f(0.0);var weight_sum=0.0;
   for(var iy:i32=-1;iy<=1;iy=iy+1){for(var ix:i32=-1;ix<=1;ix=ix+1){
     let neighbor=textureSample(input_texture,input_sampler,uv+vec2f(f32(ix),f32(iy))*step).rgb;
     let delta=neighbor-source.rgb;
     let weight=exp(-dot(delta,delta)*36.0);
     average+=neighbor*weight;weight_sum+=weight;
   }}
   average/=max(weight_sum,0.0001);
   let detail=source.rgb-average;
   c=source.rgb-detail*amount*0.85*mask;
   c+=u.scalars.z*0.22*mask*(1.0-c);
   c+=vec3f(u.scalars.w*0.07,0.0,-u.scalars.w*0.07)*mask;
   c+=detail*u.direction.x*0.6*mask;
 }
 return vec4f(clamp(c,vec3f(0.0),vec3f(1.0)),alpha);
}
