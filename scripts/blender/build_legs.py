"""Reproducible reference-informed sculpt. Run with Blender 4.5 --background --python.
An original artistic mesh, not photogrammetry. Source images stay in assets/private/.
Native Blender: Z up, -Y front; glTF export: Y up, +Z front. Anatomical left: +X.
"""
import bpy, math, json, os, sys
from pathlib import Path
from mathutils import Vector
from math import sin, cos, pi, exp, sqrt
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/model'; WEB=ROOT/'public/models'; IMG=ROOT/'public/images'
for d in (OUT, WEB, IMG): d.mkdir(parents=True, exist_ok=True)
QUICK='--quick' in sys.argv
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.meshes,bpy.data.materials,bpy.data.curves,bpy.data.cameras,bpy.data.lights):
    for d in list(datablocks): datablocks.remove(d)
model=bpy.data.collections.new('CHICKEN LEGS — editable sculpture'); bpy.context.scene.collection.children.link(model)
studio=bpy.data.collections.new('STUDIO — excluded from GLB'); bpy.context.scene.collection.children.link(studio)
anchors=bpy.data.collections.new('SPONSOR ANCHORS — anatomical left is +X'); bpy.context.scene.collection.children.link(anchors)

def move_collection(obj,col=model):
    for c in list(obj.users_collection): c.objects.unlink(obj)
    col.objects.link(obj)

def material(name,color,rough=.5,metal=0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metal
    return m
skin=material('Skin • warm tan / lean anatomy',(.255,.107,.053),.56)
p=skin.node_tree.nodes.get('Principled BSDF'); p.inputs['Subsurface Weight'].default_value=.035
p.inputs['Subsurface Radius'].default_value=(1,.35,.2)
black=material('Shorts • graphite woven fabric',(.006,.007,.009),.88)
seammat=material('Shorts • panel piping',(.038,.043,.049),.77)
waistmat=material('Shorts • elastic waistband',(.008,.009,.011),.87)
ivory=material('Shoe • warm ivory knit',(.71,.68,.59),.88)
solemat=material('Shoe • chalk foam',(.86,.83,.75),.66)
rubber=material('Shoe • charcoal outsole',(.04,.044,.046),.92)
lacemat=material('Shoe • natural cotton laces',(.84,.82,.75),.87)
panelmat=material('Shoe • suede panels',(.34,.33,.30),.89)
sockmat=material('Sock • ivory ribbed cotton',(.8,.78,.71),.91)
accentmat=material('Small yellow woven label',(.91,.58,.05),.63)
# Tiny pores are actual glTF normal texture, not an unsupported shader-only effect.
def texture_normal(mat,name,size,scale,seed):
    rng=np.random.default_rng(seed)
    a=rng.normal(0,1,(size,size)).astype(np.float32)
    for _ in range(2): a=(a+np.roll(a,1,0)+np.roll(a,-1,0)+np.roll(a,1,1)+np.roll(a,-1,1))/5
    dx=(np.roll(a,1,1)-np.roll(a,-1,1))*scale
    dy=(np.roll(a,1,0)-np.roll(a,-1,0))*scale
    ar=np.ones((size,size,4),np.float32); ar[:,:,0]=.5+dx; ar[:,:,1]=.5+dy; ar[:,:,2]=np.sqrt(np.clip(1-4*dx*dx-4*dy*dy,0,1))*.5+.5
    im=bpy.data.images.new(name,size,size,alpha=True); im.colorspace_settings.name='Non-Color'; im.pixels.foreach_set(ar.ravel()); im.pack()
    ns=mat.node_tree.nodes; tex=ns.new('ShaderNodeTexImage'); tex.image=im
    nm=ns.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value=.15
    mat.node_tree.links.new(tex.outputs['Color'],nm.inputs['Color']); mat.node_tree.links.new(nm.outputs['Normal'],ns.get('Principled BSDF').inputs['Normal'])
texture_normal(skin,'Skin pore normal (original procedural)',512,.065,18)
# Original, subtle tan variation and pores, packed into the portable material.
rng=np.random.default_rng(41);sz=512
variation=rng.normal(0,1,(sz,sz)).astype(np.float32)
for _ in range(15): variation=(variation+np.roll(variation,1,0)+np.roll(variation,-1,0)+np.roll(variation,1,1)+np.roll(variation,-1,1))/5
variation=variation/(np.std(variation)+1e-6)
rgba=np.ones((sz,sz,4),dtype=np.float32)
for channel,base in enumerate((.542,.361,.255)):
    rgba[:,:,channel]=base+variation*.003+rng.normal(0,.002,(sz,sz))
im=bpy.data.images.new('Original tan skin color',sz,sz,alpha=True);im.pixels.foreach_set(rgba.ravel());im.pack()
tex=skin.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im
skin.node_tree.links.new(tex.outputs['Color'],skin.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])


def mesh(name,verts,faces,mat,uv=None):
    me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces); me.update()
    ob=bpy.data.objects.new(name,me); model.objects.link(ob)
    if mat: me.materials.append(mat)
    for poly in me.polygons: poly.use_smooth=True
    if uv:
        lay=me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            for li in poly.loop_indices: lay.data[li].uv=uv[me.loops[li].vertex_index]
    return ob

def curve(name,pts,rad,mat,res=3):
    c=bpy.data.curves.new(name,'CURVE'); c.dimensions='3D'; c.resolution_u=4; c.bevel_depth=rad; c.bevel_resolution=min(res,1)
    sp=c.splines.new('BEZIER'); sp.bezier_points.add(len(pts)-1)
    for p,v in zip(sp.bezier_points,pts): p.co=v; p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    ob=bpy.data.objects.new(name,c);model.objects.link(ob);ob.data.materials.append(mat);return ob

def ellipsoid(name,loc,scale,mat,segments=32,rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=loc);o=bpy.context.object;o.name=name;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
    for poly in o.data.polygons: poly.use_smooth=True
    move_collection(o);return o

def tube(name,rings,mat,n=64):
    vs=[];uv=[];fs=[]
    for j,(z,cx,cy,rx,ry) in enumerate(rings):
        for i in range(n+1):
            t=2*pi*i/n;vs.append((cx+rx*sin(t),cy-ry*cos(t),z));uv.append((i/n,j/(len(rings)-1)))
    for j in range(len(rings)-1):
        for i in range(n):
            a=j*(n+1)+i;fs.append((a,a+1,a+n+2,a+n+1))
    fs.append(tuple(range(n,-1,-1)));fs.append(tuple((len(rings)-1)*(n+1)+i for i in range(n+1)))
    return mesh(name,vs,fs,mat,uv)

def interp(z,points):
    if z<=points[0][0]:return points[0][1]
    if z>=points[-1][0]:return points[-1][1]
    for i,((x0,v0),(x1,v1)) in enumerate(zip(points,points[1:])):
        if x0<=z<=x1:
            t=(z-x0)/(x1-x0);dt=x1-x0
            pp=points[max(0,i-1)];nn=points[min(len(points)-1,i+2)]
            m0=(v1-pp[1])/(x1-pp[0]);m1=(nn[1]-v0)/(nn[0]-x0)
            return (2*t**3-3*t*t+1)*v0+(t**3-2*t*t+t)*dt*m0+(-2*t**3+3*t*t)*v1+(t**3-t*t)*dt*m1

def gz(z,c,w):return exp(-((z-c)/w)**2)
def ga(t,c,w):return exp(-((math.atan2(sin(t-c),cos(t-c)))/w)**2)
# Continuous skinned loft: muscles grow from one surface. No intersecting muscle primitives.
RX=[(.19,.066),(.31,.063),(.4,.066),(.52,.085),(.69,.125),(.83,.133),(.93,.107),(1.02,.103),(1.10,.125),(1.23,.177),(1.40,.211),(1.59,.226),(1.78,.219),(1.88,.205)]
RY=[(.19,.073),(.31,.068),(.4,.066),(.52,.088),(.69,.137),(.83,.143),(.94,.113),(1.02,.101),(1.10,.132),(1.25,.167),(1.43,.179),(1.62,.198),(1.80,.210),(1.88,.210)]
def center(z,s):
    return s*interp(z,[(.19,.273),(.45,.265),(.8,.248),(1.03,.235),(1.42,.225),(1.8,.205)]),interp(z,[(.19,.0),(.55,.015),(.85,.026),(1.03,-.007),(1.32,.016),(1.8,.034)])
def legpoint(z,t,s,offset=0):
    rx=interp(z,RX);ry=interp(z,RY)
    # Front quadriceps: rectus femoris, vastus lateralis and teardrop medialis.
    d=.036*gz(z,1.43,.25)*ga(t,.0,.34)
    d+=.043*gz(z,1.40,.25)*ga(t,.91,.43)
    d+=.036*gz(z,1.175,.11)*ga(t,-.69,.4)
    d+=.020*gz(z,1.49,.22)*ga(t,-1.4,.45)
    # Anatomical channels between the muscle heads, fading naturally at tendons.
    d-=.018*gz(z,1.37,.23)*ga(t,.43+.12*(z-1.3),.105)
    d-=.014*gz(z,1.36,.18)*ga(t,-.41-(z-1.16)*.85,.10)
    d-=.006*gz(z,1.19,.10)*ga(t,0,.37)
    # Kneecap / quadriceps tendon, tibial crest.
    d+=.020*gz(z,1.045,.053)*ga(t,0,.46)
    d+=.009*gz(z,1.11,.07)*ga(t,0,.15)
    d+=.014*gz(z,.75,.20)*ga(t,.12,.23)
    d+=.008*gz(z,.69,.20)*ga(t,.75,.35)
    # Biceps femoris and semitendinosus on the back of the thigh.
    d+=.040*gz(z,1.4,.26)*ga(t,pi-.56,.42)
    d+=.041*gz(z,1.38,.23)*ga(t,-pi+.52,.35)
    d-=.015*gz(z,1.39,.22)*ga(t,pi,.17)
    # Distinct gastrocnemius heads, medial head slightly lower.
    d+=.029*gz(z,.78,.145)*ga(t,pi-.48,.42)
    d+=.038*gz(z,.72,.14)*ga(t,-pi+.48,.42)
    d-=.014*gz(z,.72,.16)*ga(t,pi,.14)
    # Achilles tendon and lateral/medial malleoli above shoe.
    d+=.010*gz(z,.44,.13)*ga(t,pi,.21)
    d+=.009*gz(z,.315,.035)*(ga(t,pi/2,.30)+ga(t,-pi/2,.3))
    cx,cy=center(z,s)
    # Very slight angular striation, only over engaged muscle bellies.
    d+=.0012*sin(36*t+z*30)*gz(z,1.35,.22)*ga(t,.4,.9)
    return (cx+s*(rx+d+offset)*sin(t),cy-(ry+d+offset)*cos(t),z)
legs={}
for side,s in [('left',1),('right',-1)]:
    V=[];F=[];UV=[];N=80;R=128
    for j in range(R+1):
        z=.19+(1.70-.19)*j/R
        for i in range(N+1):
            t=2*pi*i/N;V.append(legpoint(z,t,s));UV.append((i/N,j/R))
    for j in range(R):
        for i in range(N):
            a=j*(N+1)+i;f=(a,a+1,a+N+2,a+N+1);F.append(f if s==1 else tuple(reversed(f)))
    F.append(tuple(range(N,-1,-1)));F.append(tuple(R*(N+1)+i for i in range(N+1)))
    ob=mesh(side+'_leg_sculpt',V,F,skin,UV);legs[side]=ob
    # Two subtle raised vascular branches, following the surface (skin-colored, no blue tubing).
    for k,coords in enumerate([[(1.20,.05),(1.27,.02),(1.34,-.08),(1.4,-.06),(1.48,-.13),(1.56,-.16)],[(.50,.66),(.57,.62),(.64,.61),(.72,.68),(.78,.78)]]):
        pts=[legpoint(z,t,s,.001) for z,t in coords]
        # The muscle surface carries definition; vascular tubes omitted to avoid scar-like shading.
        pass
    # Socks. A narrow cuff keeps the calf available for its sponsor tattoo.
    sockrings=[]
    for j in range(24):
        z=.19+.25*j/23;cx,cy=center(z,s)
        sockrings.append((z,cx,cy,interp(z,RX)+.007,interp(z,RY)+.007))
    tube(side+'_sock',sockrings,sockmat,64)
    for i in range(40):
        t=2*pi*i/40
        pts=[]
        for j in range(6):
            z=.22+.211*j/5;cx,cy=center(z,s);pts.append((cx+s*(interp(z,RX)+.0075)*sin(t),cy-(interp(z,RY)+.0075)*cos(t),z))
        curve(side+'_sock_rib_'+str(i),pts,.0009,sockmat,1)
    cx,cy=center(.431,s)
    tube(side+'_sock_cuff',[(.423,cx,cy,.080,.08),(.428,cx,cy,.081,.081),(.44,cx,cy,.078,.078)],sockmat,64)
    # Minimal woven stripe on side of sock.
    for z in [.396,.406]:
        pts=[]
        for i in range(15):
            t=.8+1.05*i/14;cx,cy=center(z,s);pts.append((cx+s*.079*sin(t),cy-.079*cos(t),z))
        curve(side+'_sock_stripe_'+str(z),pts,.002,waistmat,1)
# One continuous tailored shorts surface per side: hem loops morph into two
# matching half-waist loops. This avoids intersecting cylindrical panel seams.
for side,s in [('left',1),('right',-1)]:
    V=[];F=[];UV=[];N=64;R=30
    for j in range(R+1):
        u=j/R
        blend=u*u*(3-2*u)
        for i in range(N+1):
            t=2*pi*i/N
            hem_z=1.598+.017*ga(t,pi/2,.45)+.13*ga(t,-pi/2,.60)
            z=hem_z*(1-u)+2.0*u
            bx=s*(.229+.248*sin(t));by=.023-.250*cos(t)
            # Keep inner crotch surface just off the center seam.
            bx=s*max(.006,s*bx)
            topx=s*.339*max(0,sin(t));topy=.023-.221*cos(t)
            fold=.0034*sin(9*t+u*4)*sin(pi*u)+.0014*sin(19*t-u*2)*sin(pi*u)
            x=bx*(1-blend)+topx*blend+s*fold*sin(t)
            y=by*(1-blend)+topy*blend-fold*cos(t)
            V.append((x,y,z));UV.append((i/N,u))
    for j in range(R):
        for i in range(N):
            a=j*(N+1)+i;f=(a,a+1,a+N+2,a+N+1);F.append(f if s==1 else tuple(reversed(f)))
    F.append(tuple(R*(N+1)+i for i in range(N+1)))
    mesh(side+'_tailored_running_shorts',V,F,black,UV)
    curve(side+'_shorts_hem',[V[i] for i in range(N+1)],.0022,seammat,1)
    curve(side+'_shorts_side_piping',[V[j*(N+1)+N//4] for j in range(R+1)],.0018,seammat,1)
tube('elastic_waistband',[(1.963,0,.023,.343,.224),(1.972,0,.023,.344,.225),(1.996,0,.023,.339,.221),(2,0,.023,.339,.221)],waistmat,96)
for z in (1.972,1.982,1.992):
    pts=[(.344*sin(i*2*pi/96),.023-.225*cos(i*2*pi/96),z) for i in range(97)];curve('waistband_stitch_'+str(z),pts,.0007,seammat,1)
curve('drawstring_left',[(0,-.207,1.969),(-.013,-.22,1.94),(-.018,-.236,1.88),(-.026,-.238,1.875)],.0024,lacemat,2)
curve('drawstring_right',[(0,-.207,1.969),(.013,-.218,1.945),(.028,-.231,1.90),(.023,-.235,1.887)],.0024,lacemat,2)
# Original small cloth tab: no third-party sportswear logo.
ellipsoid('shorts_yellow_woven_tab',(-.387,-.180,1.664),(.014,.003,.028),accentmat,16,8)
# Trainer geometry: shaped last, layered midsole, knit upper, suede heel and cotton laces.
for side,s in [('left',1),('right',-1)]:
    cx=.273*s;ang=-s*.085
    def shoept(x,y,z): return (cx+x*cos(ang)-y*sin(ang),x*sin(ang)+y*cos(ang),z)
    def footprint(t):
        # Forefoot is wider than heel, with rounded toe and heel.
        y=-.075-.248*cos(t);width=.105+.008*cos(t);x=width*sin(t)
        return x,y
    for part,levels,mat in [('outsole',[(.009,.945),(.018,1.0),(.030,1.01)],rubber),('sculpted_midsole',[(.027,1.01),(.041,1.033),(.065,1.013),(.088,.949)],solemat)]:
        V=[];F=[];UV=[];N=72
        for j,(z,fac) in enumerate(levels):
            for i in range(N+1):
                t=2*pi*i/N;x,y=footprint(t);lift=.027*max(0,cos(t))**5
                V.append(shoept(x*fac,(y+.075)*fac-.075,z+lift));UV.append((i/N,j/(len(levels)-1)))
        for j in range(len(levels)-1):
            for i in range(N):
                a=j*(N+1)+i;F.append((a,a+1,a+N+2,a+N+1))
        F.append(tuple(range(N,-1,-1)));F.append(tuple((len(levels)-1)*(N+1)+i for i in range(N+1)))
        mesh(side+'_shoe_'+part,V,F,mat,UV)
    # Cross sections follow the length of a real running-shoe last.
    stations=[(-.32,.007,.091,.106),(-.307,.055,.09,.139),(-.275,.092,.085,.168),(-.21,.103,.081,.185),(-.135,.095,.08,.196),(-.05,.080,.078,.231),(.03,.079,.078,.249),(.10,.075,.078,.23),(.16,.044,.078,.195),(.173,.007,.081,.157)]
    V=[];F=[];UV=[];NR=56;NS=32
    for j in range(NR+1):
        y=stations[0][0]+(stations[-1][0]-stations[0][0])*j/NR
        w=interp(y,[(a,b) for a,b,c,d in stations]);bot=interp(y,[(a,c) for a,b,c,d in stations]);top=interp(y,[(a,d) for a,b,c,d in stations])
        for i in range(NS+1):
            t=pi*i/NS;x=-w*cos(t);z=bot+(top-bot)*sin(t)**.73
            V.append(shoept(x,y,z));UV.append((i/NS,j/NR))
    for j in range(NR):
        for i in range(NS):
            a=j*(NS+1)+i;F.append((a,a+1,a+NS+2,a+NS+1))
    mesh(side+'_shoe_knit_upper',V,F,ivory,UV)
    # Toe overlay seam and side support panels.
    pts=[shoept(-.089*cos(pi*i/24),-.255,.084+.081*sin(pi*i/24)**.73) for i in range(25)];curve(side+'_toe_stitch',pts,.0012,panelmat,2)
    for e in (-1,1):
        pts=[shoept(e*.097,-.208,.122),shoept(e*.085,-.148,.143),shoept(e*.073,-.095,.163),shoept(e*.077,.02,.146),shoept(e*.072,.106,.134)]
        curve(side+'_shoe_support_panel_'+str(e),pts,.012,panelmat,3)
        pts=[shoept(e*.079,-.09,.181),shoept(e*.072,-.015,.202),shoept(e*.069,.058,.214)]
        curve(side+'_shoe_eyestay_'+str(e),pts,.010,ivory,3)
    # Woven tongue stays above the upper.
    o=ellipsoid(side+'_shoe_tongue',shoept(0,-.013,.229),(.043,.102,.014),ivory,24,12);o.rotation_euler[0]=-.22
    for j in range(5):
        y=-.111+.032*j;z=.212+.008*j
        pts=[shoept(-.061,y,z),shoept(-.027,y+.012,z+.010),shoept(.023,y-.001,z+.012),shoept(.061,y+.018,z+.004)]
        curve(side+'_shoelace_'+str(j),pts,.0032,lacemat,2)
    curve(side+'_lace_bow_left',[shoept(0,.023,.251),shoept(-.023,.025,.269),shoept(-.042,.055,.261),shoept(-.009,.048,.256),shoept(0,.023,.251)],.0027,lacemat,2)
    curve(side+'_lace_bow_right',[shoept(0,.023,.251),shoept(.019,.018,.269),shoept(.039,.046,.262),shoept(.015,.051,.257),shoept(0,.023,.251)],.0027,lacemat,2)
    curve(side+'_lace_end',[shoept(0,.023,.253),shoept(-.011,-.008,.258),shoept(-.025,-.054,.246)],.0027,lacemat,2)
    # Rear pull tab.
    curve(side+'_heel_loop',[shoept(-.02,.156,.173),shoept(-.02,.177,.239),shoept(.02,.177,.239),shoept(.02,.156,.173)],.006,panelmat,2)
# Complete full-body figure, adapted in Blender from CC0 anatomical topology.
exec(compile((ROOT/'scripts/blender/add_upper_body.py').read_text(),str(ROOT/'scripts/blender/add_upper_body.py'),'exec'))
# Sponsor anchor transforms, plus useful patch dimensions for browser decals.
placements={}
for side,s in [('left',1),('right',-1)]:
    for region,z,t,w,h in [('quad',1.38,.02,.155,.20),('hamstring',1.38,pi,.145,.20),('calf',.74,pi,.125,.14)]:
        name=side+'_'+region;pos=legpoint(z,t,s,.008)
        normal=Vector((s*sin(t),-cos(t),0)).normalized()
        empty=bpy.data.objects.new(name,None);anchors.objects.link(empty);empty.location=pos;empty.empty_display_type='PLAIN_AXES';empty.empty_display_size=.045
        empty.rotation_euler=normal.to_track_quat('Z','Y').to_euler()
        empty['placement_id']=name;empty['width']=w;empty['height']=h;empty['anatomical_side']=side
        placements[name]={'position':[round(pos[0],5),round(pos[2],5),round(-pos[1],5)],'normal':[round(normal.x,5),round(normal.z,5),round(-normal.y,5)],'width':w,'height':h,'view':'front' if region=='quad' else 'back'}
(OUT/'placements.json').write_text(json.dumps({'coordinateSystem':'glTF, Y-up, front +Z, anatomical left +X','placements':placements},indent=2)+'\n')
(WEB/'placements.json').write_text((OUT/'placements.json').read_text())
# Convert thin curves for portable glTF. Editable source curves remain in the .blend.
# Studio: large soft sources shape muscle planes and preserve dark-cloth detail.
world=bpy.data.worlds.new('Warm graphite studio');bpy.context.scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.14,.17,1);world.node_tree.nodes['Background'].inputs[1].default_value=.35

def area(name,loc,power,color,size,target=(0,0,1.85)):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);studio.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('KEY • large warm softbox',(-3,-3,4.4),350,(1,.91,.83),2.4)
area('FILL • cool front',(3,-2,2.7),50,(.80,.88,1),2.3)
area('RIM • back right',(1.5,1.5,4.0),230,(1,.88,.74),1.7)
area('BACK FILL',(-1,2,2.6),85,(.8,.88,1),2.5)
camdata=bpy.data.cameras.new('Product camera');cam=bpy.data.objects.new('Product camera',camdata);studio.objects.link(cam);bpy.context.scene.camera=cam
camdata.type='ORTHO';camdata.ortho_scale=4.06
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32 if QUICK else 80;scene.cycles.use_denoising=True
scene.render.resolution_x=960;scene.render.resolution_y=1280;scene.render.resolution_percentage=60 if QUICK else 100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
def camera_at(loc):cam.location=loc;cam.rotation_euler=(Vector((0,0,1.79))-cam.location).to_track_quat('-Z','Y').to_euler()
camera_at((2.6,-6,2.1))
# Save editable file before preparing export.
scene['art_direction']='Reference-informed athletic legs. Exaggerated low-body-fat muscle definition requested by runner. Not a photogrammetry scan.'
scene['anatomical_left']='positive X (viewer right from front)'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'chicken-legs.blend'))
# Web derivative: combine geometry by material and reduce triangles. All original
# curves and full sculpt topology stay editable in the saved .blend above.
export_collection=bpy.data.collections.new('TEMPORARY WEB DERIVATIVE');scene.collection.children.link(export_collection)
export_objects=[]
for original in list(model.objects):
    duplicate=original.copy();duplicate.data=original.data.copy();export_collection.objects.link(duplicate)
    bpy.ops.object.select_all(action='DESELECT');duplicate.select_set(True);bpy.context.view_layer.objects.active=duplicate
    bpy.ops.object.convert(target='MESH');duplicate=bpy.context.object
    export_objects.append(duplicate)
by_material={}
for ob in export_objects:
    key=ob.data.materials[0].name if ob.data.materials else 'default'
    by_material.setdefault(key,[]).append(ob)
web_objects=[]
for label,objects in by_material.items():
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:ob.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();joined=bpy.context.object;joined.name='web_'+label.split(' • ')[0].lower().replace(' ','_')
    mod=joined.modifiers.new('Mobile triangle budget','DECIMATE');mod.ratio=.48
    bpy.ops.object.modifier_apply(modifier=mod.name)
    tri=joined.modifiers.new('Portable triangle tangent basis','TRIANGULATE')
    bpy.ops.object.modifier_apply(modifier=tri.name)
    if not label.startswith('Skin'):
        for uv_layer in list(joined.data.uv_layers):joined.data.uv_layers.remove(uv_layer)
    joined.location.z-=.009
    web_objects.append(joined)
bpy.ops.object.select_all(action='DESELECT')
for o in web_objects:o.select_set(True)
for o in anchors.objects:o.location.z-=.009;o.select_set(True)
bpy.context.view_layer.objects.active=web_objects[0]
bpy.ops.export_scene.gltf(filepath=str(WEB/'chicken-legs.glb'),export_format='GLB',use_selection=True,export_apply=True,export_tangents=True,export_yup=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False,export_materials='EXPORT')
for ob in list(export_collection.objects):bpy.data.objects.remove(ob,do_unlink=True)
bpy.data.collections.remove(export_collection)
for o in anchors.objects:o.location.z+=.009
for info in placements.values():info['position'][1]=round(info['position'][1]-.009,5)
metadata={'coordinateSystem':'glTF, Y-up, front +Z, anatomical left +X','placements':placements}
for dest in (OUT/'placements.json',WEB/'placements.json'):dest.write_text(json.dumps(metadata,indent=2)+'\n')
if '--export-only' not in sys.argv:
    for name,loc in [('legs-preview',(2.6,-7,2.8)),('legs-front',(0,-7,2.25)),('legs-back',(0,7,2.25))]:
        camera_at(loc);scene.render.filepath=str(IMG/(name+'.png'));bpy.ops.render.render(write_still=True)
print('DONE: Blender sculpt, GLB, six anchors, and three views exported.')
print(json.dumps(placements,indent=2))
