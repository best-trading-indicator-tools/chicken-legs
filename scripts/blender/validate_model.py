"""Check shipped GLB structure, geometry limits, and six permanent sponsor anchors."""
import json, math, struct, itertools, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
p=ROOT/'public/models/chicken-legs.glb'
b=p.read_bytes()
magic,version,length=struct.unpack_from('<III',b)
assert magic==0x46546c67 and version==2 and length==len(b),'Invalid GLB header'
size,kind=struct.unpack_from('<II',b,12)
assert kind==0x4E4F534A
j=json.loads(b[20:20+size]);nodes=j['nodes'];accessors=j['accessors']
required={side+'_'+part for side in ('left','right') for part in ('quad','hamstring','calf')}
anchors={n['name']:n for n in nodes if n.get('name') in required}
assert anchors.keys()==required,'Missing permanent sponsor anchors'
for name,node in anchors.items():
    assert node.get('extras',{}).get('placement_id')==name
    pos=node.get('translation',[0,0,0]);assert all(math.isfinite(x) for x in pos)
    assert .4<pos[1]<1.7,f'Anchor {name} outside expected leg height'
    assert (pos[0]>0)==name.startswith('left'),'Anatomical left/right reversed'
    assert (pos[2]>0)==name.endswith('quad'),'Front/back anchor reversed'
triangles=sum(accessors[p['indices']]['count']//3 for m in j['meshes'] for p in m['primitives'])
assert triangles<150000,f'Geometry budget exceeded: {triangles}'
assert len(b)<6_000_000,f'GLB size budget exceeded: {len(b)}'
for a in accessors:
    for k in ('min','max'):
        if k in a:assert all(math.isfinite(x) for x in a[k])
for image in j.get('images',[]):assert 'bufferView' in image,'Texture depends on an external file'
for n in ('legs-front.png','legs-back.png','legs-preview.png'):
    assert (ROOT/'public/images'/n).is_file(),f'Missing render {n}'
# World bounds use each mesh accessor's corners and the exported node transform.
parents={child:i for i,n in enumerate(nodes) for child in n.get('children',[])}
def transformed(p,n):
    scale=n.get('scale',[1,1,1]);v=[p[i]*scale[i] for i in range(3)]
    q=n.get('rotation',[0,0,0,1]);x,y,z,w=q
    tx=2*(y*v[2]-z*v[1]);ty=2*(z*v[0]-x*v[2]);tz=2*(x*v[1]-y*v[0])
    v=[v[0]+w*tx+y*tz-z*ty,v[1]+w*ty+z*tx-x*tz,v[2]+w*tz+x*ty-y*tx]
    tr=n.get('translation',[0,0,0]);return [v[i]+tr[i] for i in range(3)]
points=[]
for ni,node in enumerate(nodes):
    if 'mesh' not in node:continue
    for primitive in j['meshes'][node['mesh']]['primitives']:
        a=accessors[primitive['attributes']['POSITION']]
        for p in itertools.product(*zip(a['min'],a['max'])):
            p=transformed(p,node);parent=parents.get(ni)
            while parent is not None:p=transformed(p,nodes[parent]);parent=parents.get(parent)
            points.append(p)
bounds={'min':[round(min(p[i] for p in points),6) for i in range(3)],'max':[round(max(p[i] for p in points),6) for i in range(3)]}
assert abs(bounds['min'][1])<.001,'Model sole must meet ground plane'
assert 3.4<bounds['max'][1]<3.8,'Full body must include the head/cap'
report={'file':'public/models/chicken-legs.glb','bytes':len(b),'triangles':triangles,'mesh_count':len(j['meshes']),'materials':len(j.get('materials',[])),'anchors':sorted(anchors),'embedded_textures':len(j.get('images',[])),'bounds':bounds,'coordinateSystem':'glTF Y-up, front +Z, anatomical left +X'}
print(json.dumps(report,indent=2))
if '--write-report' in sys.argv:(ROOT/'assets/model/model-report.json').write_text(json.dumps(report,indent=2)+'\n')
