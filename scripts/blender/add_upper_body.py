"""Adapt CC0 anatomical topology into a reference-informed athletic upper body.
Executed in build_legs.py's Blender namespace; includes artistic body/face adjustments.
"""
from collections import defaultdict
VENDOR=ROOT/'scripts/blender/vendor'
raw=[];uvraw=[];allfaces=[];groups=defaultdict(set);group=''
for line in (VENDOR/'makehuman-base.obj').read_text().splitlines():
    p=line.split()
    if not p:continue
    if p[0]=='v':raw.append([float(x) for x in p[1:4]])
    elif p[0]=='vt':uvraw.append([float(x) for x in p[1:3]])
    elif p[0]=='g':group=p[1]
    elif p[0]=='f':
        ids=[int(x.split('/')[0])-1 for x in p[1:]]
        uvs=[int(x.split('/')[1])-1 if '/' in x and x.split('/')[1] else 0 for x in p[1:]]
        groups[group].update(ids);allfaces.append((group,ids,uvs))
coords=np.array(raw,dtype=float)
for target in ('adult-male.target','lean-muscular.target'):
    for line in (VENDOR/target).read_text().splitlines():
        p=line.split()
        if len(p)==4 and not line.startswith('#'):coords[int(p[0])]+=np.array([float(x) for x in p[1:]])
# Reference proportions: broad pecs/delts, lean waist, elongated strong nose, square jaw.
for i,(x,y,z) in enumerate(coords):
    if 2.0<y<6.15 and abs(x)<2.0:
        # Widen upper V while holding waist to the running shorts.
        coords[i,0]*=1.09+.14*gz(y,5.3,.85)
        if z>.1:
            pec=.39*gz(y,5.14,.48)*gz(abs(x),.87,.71)
            abdomen=sum(.17*gz(y,h,.19)*gz(abs(x),.36,.28) for h in (2.9,3.4,3.9,4.35))
            midline=.095*gz(x,0,.09)*gz(y,3.7,1.0)
            coords[i,2]+=pec+abdomen-midline
        else:
            coords[i,2]-=.10*gz(y,5.1,.7)*gz(abs(x),.90,.6)
    if 7.2<y<8.6 and abs(x)<.35 and z>1.2:coords[i,2]+=.10*gz(y,7.95,.30)*gz(x,0,.18)
unposed_coords=coords.copy()
# Natural low A stance. Arms remain anatomically connected to shoulders/hands.
for i,(x,y,z) in enumerate(coords.copy()):
    if abs(x)>1.60 and y>-.5:
        w=max(0,min(1,(abs(x)-1.6)/.65));w=w*w*(3-2*w)
        theta=-math.radians(24)*w
        ax=abs(x)-1.88;ay=y-5.80
        xx=1.88+cos(theta)*ax-sin(theta)*ay;yy=5.80+sin(theta)*ax+cos(theta)*ay
        coords[i,0]=math.copysign(xx,x);coords[i,1]=yy
        coords[i,2]-=.7*w*max(0,min(1,(5.0-y)/2.1))
SCALE=.210;SHIFT=1.58

def transform(v):return (float(v[0])*SCALE,-float(v[2])*SCALE,float(v[1])*SCALE+SHIFT)
# Retain torso/head/arms, removing the base legs hidden under shorts. Anatomical
# leg sculpture authored in build_legs.py stays in place with its eight anchors.
faces=[];fuv=[];used=set()
for g,idxs,uvs in allfaces:
    if g!='body':continue
    face_center=coords[idxs].mean(0)
    original_center=unposed_coords[idxs].mean(0)
    if face_center[1]>1.80 or (abs(original_center[0])>2.3 and original_center[1]>.0):
        faces.append(idxs);fuv.append(uvs);used.update(idxs)
used=sorted(used);mapping={old:new for new,old in enumerate(used)}
verts=[transform(coords[i]) for i in used]
ob=mesh('reference_sculpt_upper_body',[v for v in verts],[[mapping[i] for i in f] for f in faces],skin)
lay=ob.data.uv_layers.new(name='UVMap')
for poly,uvs in zip(ob.data.polygons,fuv):
    for li,ui in zip(poly.loop_indices,uvs):lay.data[li].uv=uvraw[ui]
# Keep original quads in editable source; subdivide once for smooth face/hand forms.
sub=ob.modifiers.new('Sculpt surface subdivision','SUBSURF');sub.levels=1;sub.render_levels=1
bpy.context.view_layer.objects.active=ob;ob.select_set(True)
bpy.ops.object.modifier_apply(modifier=sub.name)
# Sculpt on the subdivided surface so the abdominal anatomy survives smoothing.
for v in ob.data.vertices:
    x,y,z=v.co
    if z<2.12:
        w=max(0,min(1,(2.12-z)/.14));v.co.y*=1-.34*w;v.co.x*=1-.10*w
    if 2.04<z<2.63 and y<-.05:
        front=max(0,min(1,(-y-.05)/.08))
        rectus=sum(.025*gz(z,h,.047)*gz(abs(x),.079,.060) for h in (2.17,2.29,2.41,2.53))
        linea=.007*gz(x,0,.016)*gz(z,2.35,.25)
        # Lean obliques follow the outer edge of the abdominal wall.
        oblique=.008*gz(abs(x),.20+.13*(z-2.25),.04)*gz(z,2.3,.25)
        v.co.y-=front*(rectus+oblique-linea)
ob.data.update()

# Small, anatomically placed areolae sit on the sculpted pectoral surface.
areolamat=material('Torso • warm natural detail',(.125,.046,.028),.74)
for sign in (-1,1):
    start=Vector((sign*.226,-1,2.638));hit,point,normal,index=ob.ray_cast(start,Vector((0,1,0)))
    if hit:
        ellipsoid('pectoral_detail_'+str(sign),point+Vector((0,-.0016,0)),(.012,.0026,.010),areolamat,20,12)
# Face material details follow the same underlying anatomical surface.
beard=material('Face • close dark brown beard',(.075,.036,.020),.96)
lip=material('Face • natural lips',(.20,.075,.05),.68)
nipple=material('Torso • natural areola',(.12,.037,.021),.75)
beardfaces=[];lipfaces=[]
for f in faces:
    c=coords[f].mean(0);x,y,z=c
    # Beard: jaw, chin, sideburns, and short moustache. Sculpted mouth stays clear.
    jaw=(7.02<y<7.66+.12*abs(x) and z>.50 and abs(x)<.92)
    sideburn=(7.55<y<8.16 and .60<abs(x)<.91 and z>.25)
    moustache=(7.72<y<7.85 and abs(x)<.34 and z>1.15)
    mouth_clear=(7.58<y<7.72 and abs(x)<.42 and z>1.20)
    if (jaw or sideburn or moustache) and not mouth_clear:beardfaces.append([mapping[i] for i in f])
    if mouth_clear:lipfaces.append([mapping[i] for i in f])
for name,fs,mat,off in [('close_cropped_beard',beardfaces,beard,.0014),('natural_lip_detail',lipfaces,lip,.0007)]:
    if not fs:continue
    vv=[]
    for v in verts:
        vv.append((v[0]*1.003,v[1]-off if v[1]<0 else v[1]+off,v[2]))
    b=mesh(name,vv,fs,mat);su=b.modifiers.new('Smooth detail surface','SUBSURF');su.levels=1;su.render_levels=1
# Real separate eyeballs sit behind eyelids in the topology.
sclera=material('Eyes • ivory sclera',(.68,.65,.59),.34)
iris=material('Eyes • slate blue iris',(.055,.105,.12),.38)
pupil=material('Eyes • dark pupil',(.002,.003,.003),.29)
for side,s in [('left',1),('right',-1)]:
    ids=list(groups['joint-'+('l' if s==1 else 'r')+'-eye']);p=Vector(transform(coords[ids].mean(0)))
    ellipsoid(side+'_eyeball',p,(.026,.029,.023),sclera,24,16)
    ellipsoid(side+'_iris',p+Vector((0,-.027,0)),(.0105,.003,.0105),iris,24,12)
    ellipsoid(side+'_pupil',p+Vector((0,-.0295,0)),(.0045,.0015,.0055),pupil,20,10)
# Cap is a tailored dome with a curved forward brim, matching the supplied selfie.
capmat=material('Cap • charcoal technical twill',(.009,.011,.014),.90)
capstitch=material('Cap • graphite stitching',(.03,.034,.04),.91)
capbase=3.382;capheight=.236;caprx=.211;capry=.248;capcy=-.099
V=[];F=[];N=64;R=18
for j in range(R+1):
    phi=(pi/2)*j/R
    rr=cos(phi)
    for i in range(N+1):
        t=2*pi*i/N
        V.append((caprx*rr*sin(t),capcy-capry*rr*cos(t),capbase+capheight*sin(phi)))
for j in range(R):
    for i in range(N):
        a=j*(N+1)+i;F.append((a,a+1,a+N+2,a+N+1))
mesh('charcoal_running_cap_crown',V,F,capmat)
for t in [0,pi/3,2*pi/3,pi,4*pi/3,5*pi/3]:
    pts=[]
    for j in range(17):
        phi=pi/2*j/16;rr=cos(phi);pts.append(((caprx+.001)*rr*sin(t),capcy-(capry+.001)*rr*cos(t),capbase+(capheight+.001)*sin(phi)))
    curve('cap_panel_seam',pts,.00085,capstitch,1)
ellipsoid('cap_top_button',(0,capcy,capbase+capheight),(.016,.016,.005),capmat,20,10)
# Bill extends forward, rounded at the leading edge and bent gently across its width.
V=[];F=[];NX=32;NY=9
for j in range(NY+1):
    u=j/NY
    for i in range(NX+1):
        x=-.207+.414*i/NX
        edge=sqrt(max(0,1-(x/.216)**2))
        rear=capcy-.16*edge;front=capcy-.385*edge
        y=rear*(1-u)+front*u
        z=capbase+.018-.040*(x/.207)**2-.020*u
        V.append((x,y,z))
for j in range(NY):
    for i in range(NX):
        a=j*(NX+1)+i;F.append((a,a+1,a+NX+2,a+NX+1))
bill=mesh('cap_curved_bill',V,F,capmat);solid=bill.modifiers.new('Fabric bill thickness','SOLIDIFY');solid.thickness=.007
for f in (.84,.95):
    pts=[]
    for i in range(33):
        x=-.202+.404*i/32;edge=sqrt(max(0,1-(x/.216)**2));y=capcy-.16*edge*(1-f)-.385*edge*f;z=capbase+.019-.040*(x/.207)**2-.02*f;pts.append((x,y,z))
    curve('cap_bill_topstitch',pts,.0007,capstitch,1)
