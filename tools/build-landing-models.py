"""Blender 4.3: six schematic bindings and localized fallback renders.
Run: blender -b -t 4 -P tools/build-landing-models.py -- [--preview]
Dimensions communicate relative construction, not manufacturing specifications.
"""
import bpy, math, sys, json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/landing/models'
SCRATCH = ROOT / 'work/book-3d'
OUT.mkdir(parents=True, exist_ok=True)
SCRATCH.mkdir(parents=True, exist_ok=True)
PREVIEW = '--preview' in sys.argv
MODELS_ONLY = '--models-only' in sys.argv
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def material(name, color, roughness=.65):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    return mat

# glTF colors are linear, as are Blender shader inputs.
paper = material('Paper', (.83, .80, .71), .9)
edge = material('Cover edge', (.67, .64, .54), .72)
board = material('Cover board', (.88, .85, .76), .65)
back = material('Sage binding', (.12, .20, .145), .7)
front = material('Cover artwork', (.94, .92, .85), .55)
inside = material('Endpaper', (.82, .80, .73), .88)
# Fine paper grain is used for Blender renders; the glTF remains lightweight.
for mat in [paper, board, back, front]:
    nodes = mat.node_tree.nodes
    noise = nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 260
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .11
    bump.inputs['Distance'].default_value = .008
    mat.node_tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    mat.node_tree.links.new(bump.outputs['Normal'], nodes.get('Principled BSDF').inputs['Normal'])


def slab(name, width, height, base, thick, shape, top_mat, bottom_mat, edge_mat, nx=48, ny=6):
    verts, faces, mids, uv = [], [], [], []
    for layer in [0, 1]:
        for j in range(ny+1):
            v = j/ny
            for i in range(nx+1):
                u = i/nx
                verts.append(((u-.5)*width, (v-.5)*height, base + shape(u,v) + layer*thick))
                uv.append((u,v))
    count = (nx+1)*(ny+1)
    for layer in [0,1]:
        for j in range(ny):
            for i in range(nx):
                a=layer*count+j*(nx+1)+i
                face=(a,a+1,a+nx+2,a+nx+1)
                faces.append(face if layer else face[::-1]); mids.append(0 if layer else 1)
    border = list(range(nx+1)) + [j*(nx+1)+nx for j in range(1,ny+1)] + [ny*(nx+1)+i for i in range(nx-1,-1,-1)] + [j*(nx+1) for j in range(ny-1,0,-1)]
    for k,a in enumerate(border):
        b=border[(k+1)%len(border)]
        faces.append((a,b,b+count,a+count)); mids.append(2)
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    for mat in [top_mat,bottom_mat,edge_mat]:mesh.materials.append(mat)
    tex=mesh.uv_layers.new(name='UVMap')
    for poly,mid in zip(mesh.polygons,mids):
        poly.material_index=mid
        poly.use_smooth=mid<2
        for loop in poly.loop_indices: tex.data[loop].uv=uv[mesh.loops[loop].vertex_index]
    return obj


def book(binding, pages):
    objects=[]
    hard=binding=='hard'; width=1.95; height=2.45
    inset=.045 if hard else .004
    thickness=.038 if hard else .007
    # Group pairs of sheets to avoid subpixel moiré on phone screens.
    leaf_step=.013
    depth=pages//4*leaf_step
    ground=.035
    shape_back=lambda u,v: 0
    objects.append(slab('BackCover',width,height,ground,thickness,shape_back,inside,back,edge))
    for n in range(pages//4):
        q=n/(pages//4-1)
        # Gentle spring and a slight, square-cornered lift in the soft binding.
        def curve(u,v,q=q):
            return (.008 if hard else .10)*u**3*q**3 + (.003 if hard else .012)*math.sin(math.pi*v)*u*u*q
        objects.append(slab('Leaf_%02d'%n,width-2*inset,height-2*inset,ground+thickness+n*leaf_step,leaf_step-.0012,curve,paper,paper,paper,nx=16,ny=2))
    top=ground+thickness+depth+.005
    if hard:
        def cover_shape(u,v):
            hinge=-.004*math.exp(-((u-.045)/.012)**2)
            return .02*u+hinge
    else:
        def cover_shape(u,v):
            return .13*u**3+.02*math.sin(math.pi*v)*u*u
    objects.append(slab('FrontCover',width,height,top,thickness,cover_shape,front,inside,edge,nx=96,ny=12))
    # A continuous curved case spine, rather than a floating stack of rectangles.
    verts=[]; faces=[]; segments=24
    for zside in range(segments+1):
        t=zside/segments
        z=ground+(top+thickness-ground)*t
        x=-width/2-(.022 if hard else .006)*math.sin(math.pi*t)
        verts.extend([(x,-height/2,z),(x,height/2,z)])
    for i in range(segments):faces.append((i*2,i*2+1,i*2+3,i*2+2))
    mesh=bpy.data.meshes.new('Spine');mesh.from_pydata(verts,[],faces);mesh.update();mesh.materials.append(back if hard else board)
    obj=bpy.data.objects.new('Spine',mesh);bpy.context.collection.objects.link(obj)
    for poly in mesh.polygons:poly.use_smooth=True
    objects.append(obj)
    leaves=[obj for obj in objects if obj.name.startswith('Leaf_')]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in leaves:obj.select_set(True)
    bpy.context.view_layer.objects.active=leaves[0]
    bpy.ops.object.join()
    block=bpy.context.object;block.name='PaperBlock'
    block.data.materials.clear();block.data.materials.append(paper)
    for poly in block.data.polygons:poly.material_index=0
    objects=[obj for obj in objects if obj not in leaves]+[block]
    for obj in objects:
        obj['binding']=binding;obj['pageCount']=pages
    return objects


def point_at(obj, target):obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=32
scene.cycles.use_denoising=False
scene.render.resolution_x=800;scene.render.resolution_y=688;scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.view_settings.view_transform='AgX'
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.8,.83,.88,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.3
bpy.ops.mesh.primitive_plane_add(size=200)
floor=bpy.context.object;floor.name='Shadow catcher';floor.is_shadow_catcher=True
floor.data.materials.append(material('Stage',(.7,.68,.63),1))
bpy.ops.object.camera_add(location=(3.8,-5.2,5.9))
camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=3.65;point_at(camera,(0,0,.08));scene.camera=camera
for name,loc,power,size in [('Window',(-3,-4,7),650,5),('Fill',(4,1,5),180,4),('Rim',(-2,4,3),230,3)]:
 bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.name=name;light.data.energy=power;light.data.shape='DISK';light.data.size=size;point_at(light,(0,0,0))
tex=front.node_tree.nodes.new('ShaderNodeTexImage')
variants=[('hard',80)] if PREVIEW else [(c,n) for c in ['hard','soft'] for n in [40,60,80]]
manifest={}
for binding,pages in variants:
 objects=book(binding,pages)
 bpy.ops.object.select_all(action='DESELECT')
 for obj in objects:obj.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 # No texture embedded: the existing KA/EN/RU cover is shared and switched in-browser.
 for link in list(front.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].links): front.node_tree.links.remove(link)
 bpy.ops.export_scene.gltf(filepath=str(OUT/f'{binding}-{pages}.glb'),export_format='GLB',use_selection=True,export_extras=True,export_texcoords=True,export_normals=True,export_materials='EXPORT')
 manifest[f'{binding}-{pages}']={'leaves':pages//2,'coverThickness':.038 if binding=='hard' else .007,'pageInset':.045 if binding=='hard' else .004}
 for language in ([] if MODELS_ONLY else ['ru'] if PREVIEW else ['ka','en','ru']):
  if (SCRATCH/f'{binding}-{pages}-{language}.png').exists() and not PREVIEW: continue
  tex.image=bpy.data.images.load(str(ROOT/f'public/landing/book-classic-cover-{language}.webp'),check_existing=True)
  front.node_tree.links.new(tex.outputs['Color'],front.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
  scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
  scene.render.filepath=str(SCRATCH/f'{binding}-{pages}-{language}.png')
  bpy.ops.render.render(write_still=True)
 if binding=='hard' and pages==80:
  tex.image=bpy.data.images.load(str(ROOT/'public/landing/book-classic-cover-ru.webp'),check_existing=True)
  front.node_tree.links.new(tex.outputs['Color'],front.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
  bpy.ops.file.pack_all()
  bpy.ops.wm.save_as_mainfile(filepath=str(SCRATCH/'matiane-book.blend'))
 for obj in objects:bpy.data.objects.remove(obj,do_unlink=True)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
