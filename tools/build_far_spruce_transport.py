#!/usr/bin/env python3
"""Losslessly de-duplicate identical far-spruce alpha, retaining ALL normal RGB.
Run tools/.bpy/bin/python tools/build_far_spruce_transport.py [--check].
The two original RGBA gzip files remain untouched for farTransport=v26 A/B.
All original premultiplied albedo/normal bytes, including alpha-zero RGB,
are compared with the reconstructed output before atomic publication.
"""
import argparse,gzip,hashlib,io,json,os
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parent.parent
DIR=ROOT/'web/public/assets/v2/spruce/far-v14'
MANIFEST=DIR/'impostor-manifest.json'
REPORT=ROOT/'tools/reports/far-spruce-transport-v27.json'
FORMAT='rgb-planar-shared-albedo-alpha-v1'
def sha(raw):return hashlib.sha256(raw).hexdigest()
def encode(raw):
    stream=io.BytesIO()
    with gzip.GzipFile(filename='',mode='wb',compresslevel=9,fileobj=stream,mtime=0) as f:f.write(raw)
    return stream.getvalue()
def atomic(path,data):
    pending=path.with_name(path.name+'.pending');pending.write_bytes(data);os.replace(pending,path)
def build(check=False):
    manifest=json.loads(MANIFEST.read_text());files={f['kind']:f for f in manifest['files']};arrays={};original={}
    count=manifest['width']*manifest['height']*manifest['layers']
    for kind,f in files.items():
        packed=(DIR/f['url']).read_bytes();raw=gzip.decompress(packed)
        assert len(packed)==f['bytes'] and len(raw)==count*4 and sha(raw)==f['sha256']
        original[kind]=raw;arrays[kind]=np.frombuffer(raw,dtype=np.uint8).reshape(count,4)
    assert np.array_equal(arrays['albedo'][:,3],arrays['normal'][:,3]),'Alpha differs: do not publish this format'
    rgb=arrays['normal'][:,:3].T.copy();raw=rgb.tobytes();packed=encode(raw)
    recovered=np.empty((count,4),dtype=np.uint8);recovered[:,:3]=np.frombuffer(gzip.decompress(packed),dtype=np.uint8).reshape(3,count).T;recovered[:,3]=arrays['albedo'][:,3]
    assert recovered.tobytes()==original['normal'],'Every RGBA byte, including hidden RGB, must survive'
    filename='schrenk-far-normal.rgb-planar-v27.gz'
    files['normal']['losslessTransport']={'encoding':FORMAT,'url':filename,'bytes':len(packed),'decodedBytes':len(raw),'gzipSHA256':sha(packed),'alphaSource':'albedo','rgbaSHA256':files['normal']['sha256']}
    old=sum(f['bytes'] for f in files.values());new=old-files['normal']['bytes']+len(packed)
    report={'generator':'tools/build_far_spruce_transport.py','encoding':FORMAT,'rawRGBABytes':sum(len(r) for r in original.values()),'originalTransportBytes':old,'transportBytes':new,'savedBytes':old-new,'savedPercent':100*(old-new)/old,'outputRGBAUnchanged':True,'normalRGBUnderZeroAlphaPreserved':True,'originalFilesPreserved':True,'normalRGBA_SHA256':sha(original['normal']),'albedoRGBA_SHA256':sha(original['albedo']),'rejectedPredictors':'Sub, Up, Paeth and row-adaptive gzip yielded no material benefit; no prediction decoder was added','limits':'Transfer bytes only; no claim of full first-frame or frame-rate improvement'}
    payloads={DIR/filename:packed,MANIFEST:(json.dumps(manifest,indent=2)+'\n').encode(),REPORT:(json.dumps(report,indent=2)+'\n').encode()}
    if not check:
        for path,data in payloads.items():atomic(path,data)
    for path,data in payloads.items():assert path.read_bytes()==data,str(path)
    print(json.dumps(report,indent=2))
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--check',action='store_true');build(p.parse_args().check)
