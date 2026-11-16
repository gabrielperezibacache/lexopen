const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),os=require("node:os");
const {createDataBackup,restoreDataDirectory,finalizeRestore}=require("./backup.cjs");
const {parseEnvFile}=require("./config.cjs");
async function main(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),"lexopen-backup-relocate-test-")),source=path.join(root,"source"),backup=path.join(root,"backup"),target=path.join(root,"target");
 try{
  await fs.mkdir(path.join(source,"pgdata"),{recursive:true});await fs.mkdir(path.join(source,"storage"));
  await fs.writeFile(path.join(source,"pgdata","PG_VERSION"),"16\n");await fs.writeFile(path.join(source,"storage","fixture.txt"),"Fictitious bytes");
  const env=`LEXOPEN_DESKTOP=1\nLEXOPEN_DATA_DIR=${source}\nSTORAGE_PATH=${path.join(source,"storage")}\nDATABASE_URL=postgresql://lexopen:fictitious@127.0.0.1:54329/lexopen\nSESSION_SECRET=fictitious-preserved-secret\n`;
  await fs.writeFile(path.join(source,".env"),env);await createDataBackup(source,backup);
  const result=await restoreDataDirectory(target,backup,{relocateManagedHost:true});
  const restored=parseEnvFile(await fs.readFile(path.join(target,".env"),"utf8")).map;
  assert.equal(restored.STORAGE_PATH,path.join(target,"storage"));assert.equal(restored.LEXOPEN_DATA_DIR,target);assert.equal(restored.SESSION_SECRET,"fictitious-preserved-secret");
  assert.equal(await fs.readFile(path.join(source,".env"),"utf8"),env);await finalizeRestore(result.rollback);
  const bad=path.join(root,"bad");await fs.cp(backup,bad,{recursive:true});await fs.writeFile(path.join(bad,".env"),env.replace(path.join(source,"storage"),path.join(root,"outside")));
  const legacy=JSON.parse(await fs.readFile(path.join(bad,"manifest.json"),"utf8"));delete legacy.integrity;legacy.formatVersion=1;await fs.writeFile(path.join(bad,"manifest.json"),JSON.stringify(legacy));
  await assert.rejects(restoreDataDirectory(target,bad,{relocateManagedHost:true}),/rutas externas/);
  assert.equal(await fs.readFile(path.join(target,"storage","fixture.txt"),"utf8"),"Fictitious bytes","prior destination survives a failure after copy");
  const cp=fs.cp;fs.cp=async(_source,destination)=>{await fs.mkdir(destination,{recursive:true});await fs.writeFile(path.join(destination,"partial"),"partial");throw Error("Fictitious partial-copy failure");};
  try{await assert.rejects(restoreDataDirectory(target,backup),/partial-copy/);}finally{fs.cp=cp;}
  assert.equal(await fs.readFile(path.join(target,"storage","fixture.txt"),"utf8"),"Fictitious bytes");assert.equal(await fs.readFile(path.join(source,".env"),"utf8"),env);
  console.log("Backup relocation: clean target, isolated managed paths, preserved secrets/source and rollback after partial copy/configuration failure passed.");
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
