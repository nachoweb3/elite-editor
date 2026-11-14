use effects::{EffectPipeline,EffectPass,UniformValue,ApplyEffectsOptions};
use gpu::GpuContext;
use std::collections::HashMap;

fn render(context:&GpuContext,pipeline:&EffectPipeline,color:[u8;4],mode:f32,amount:f32)->Vec<u8>{
 let source=context.create_render_texture(1,1,"test-source");
 context.queue().write_texture(wgpu::TexelCopyTextureInfo{texture:&source,mip_level:0,origin:wgpu::Origin3d::ZERO,aspect:wgpu::TextureAspect::All},&color,wgpu::TexelCopyBufferLayout{offset:0,bytes_per_row:Some(4),rows_per_image:Some(1)},wgpu::Extent3d{width:1,height:1,depth_or_array_layers:1});
 let passes=vec![EffectPass{shader:"elite".into(),uniforms:HashMap::from([("u_values".into(),UniformValue::Vector(vec![mode,amount,if mode==6.0 {0.08}else if mode==9.0 {amount}else{1.0},if mode==9.0 {0.0}else{1.0}])),("u_extra".into(),UniformValue::Vector(if mode==9.0 {vec![0.5,0.5,0.6,0.6]}else{vec![0.0,1.0,0.0,0.0]}))])}];
 let output=pipeline.apply(context,ApplyEffectsOptions{source:&source,width:1,height:1,passes:&passes}).unwrap();
 let buffer=context.device().create_buffer(&wgpu::BufferDescriptor{label:None,size:256,usage:wgpu::BufferUsages::COPY_DST|wgpu::BufferUsages::MAP_READ,mapped_at_creation:false});
 let mut encoder=context.device().create_command_encoder(&Default::default());encoder.copy_texture_to_buffer(wgpu::TexelCopyTextureInfo{texture:&output,mip_level:0,origin:wgpu::Origin3d::ZERO,aspect:wgpu::TextureAspect::All},wgpu::TexelCopyBufferInfo{buffer:&buffer,layout:wgpu::TexelCopyBufferLayout{offset:0,bytes_per_row:Some(256),rows_per_image:Some(1)}},wgpu::Extent3d{width:1,height:1,depth_or_array_layers:1});context.queue().submit([encoder.finish()]);
 let (tx,rx)=std::sync::mpsc::channel();buffer.slice(..).map_async(wgpu::MapMode::Read,move|r|{tx.send(r).unwrap();});context.device().poll(wgpu::PollType::wait_indefinitely()).unwrap();rx.recv().unwrap().unwrap();let data=buffer.slice(..).get_mapped_range();data[..4].to_vec()
}
#[test] fn chroma_and_color_use_real_gpu(){
 let context=pollster::block_on(GpuContext::new()).expect("GPU adapter required for this integration test");let pipeline=EffectPipeline::new(&context);
 let green=render(&context,&pipeline,[0,255,0,255],6.0,0.15);assert_eq!(green[3],0,"green must be transparent");
 let red=render(&context,&pipeline,[0,0,255,255],6.0,0.15);assert_eq!(red[3],255,"foreground must remain opaque");
 let mono=render(&context,&pipeline,[0,0,255,255],1.0,1.0);assert_eq!(mono[0],mono[1]);assert_eq!(mono[1],mono[2]);
 let neutral=render(&context,&pipeline,[80,100,120,255],9.0,0.0);assert_eq!(neutral,vec![80,100,120,255]);
 let lifted=render(&context,&pipeline,[80,100,120,255],9.0,0.5);assert!(lifted[0]>80 && lifted[1]>100 && lifted[2]>120);assert_eq!(lifted[3],255);
 for mode in [0.,2.,3.,4.,5.,7.,8.]{let output=render(&context,&pipeline,[80,100,120,255],mode,0.5);assert_eq!(output[3],255);}
}
