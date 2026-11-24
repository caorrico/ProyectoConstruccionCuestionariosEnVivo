import { randomInt } from 'node:crypto';

type Obj = Record<string, unknown>;
export interface Question { id: string; order: number; prompt: string; time_limit_seconds: number; type: string; data: Obj; correct_answer: Obj; }
export interface Snapshot { quiz_id: string; version_id: string; owner_id: string; title: string; questions: Question[]; }
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(): never { throw new Error('El cuestionario publicado no cumple el contrato v1'); }
function obj(value: unknown): Obj { if(!value || typeof value!=='object' || Array.isArray(value)) return fail(); return value as Obj; }
function text(value: unknown): string { if(typeof value!=='string' || !value.trim() || value.length>10000) return fail(); return value; }
function id(value: unknown): string { const s=text(value); if(s.length>200) return fail(); return s; }
function unique(values: string[]): boolean { return new Set(values).size===values.length; }
function items(value: unknown,min: number,max: number): string[] {
 if(!Array.isArray(value) || value.length<min || value.length>max) return fail();
 const ids=value.map(item=>{ const v=obj(item); text(v.text); return id(v.id); });
 if(!unique(ids)) return fail(); return ids;
}
function validateQuestion(raw: unknown): Question {
 const q=obj(raw); const qid=text(q.id); if(!uuid.test(qid)) return fail();
 if(!Number.isInteger(q.order) || (q.order as number)<1 || !Number.isInteger(q.time_limit_seconds) || (q.time_limit_seconds as number)<1 || (q.time_limit_seconds as number)>3600) return fail();
 const prompt=text(q.prompt); const type=text(q.type); const data=obj(q.data); const answer=obj(q.correct_answer);
 switch(type) {
  case 'SINGLE_CHOICE': { const options=items(data.options,2,4); if(!options.includes(id(answer.option_id))) return fail(); break; }
  case 'TRUE_FALSE': if(typeof answer.value!=='boolean') return fail(); break;
  case 'MULTIPLE_CHOICE': { const options=items(data.options,3,6); if(!Array.isArray(answer.option_ids)) return fail(); const selected=answer.option_ids.map(id); if(selected.length<2 || !unique(selected) || !selected.every(x=>options.includes(x))) return fail(); break; }
  case 'MATCHING': { const left=items(data.left,2,6), right=items(data.right,2,6); if(left.length!==right.length || !Array.isArray(answer.pairs) || answer.pairs.length!==left.length) return fail(); const pairs=answer.pairs.map(obj); const ls=pairs.map(p=>id(p.left_id)), rs=pairs.map(p=>id(p.right_id)); if(!unique(ls)||!unique(rs)||!ls.every(x=>left.includes(x))||!rs.every(x=>right.includes(x))) return fail(); break; }
  case 'SHORT_ANSWER': if(!Array.isArray(answer.accepted_answers) || answer.accepted_answers.length===0 || !answer.accepted_answers.every(x=>typeof x==='string' && !!x.trim() && x.length<=1000)) return fail(); break;
  default: return fail();
 }
 // Copy only contract fields so unexpected nested metadata cannot leak in public responses.
 return {id:qid,order:q.order as number,prompt,time_limit_seconds:q.time_limit_seconds as number,type,data,correct_answer:answer};
}
export function validateSnapshot(value: unknown, quizId: string, ownerId: string): Snapshot {
 const source=obj(value); const version=text(source.version_id); const title=text(source.title);
 if(source.quiz_id!==quizId || source.owner_id!==ownerId || !uuid.test(quizId) || !uuid.test(ownerId) || !uuid.test(version) || !Array.isArray(source.questions) || source.questions.length===0 || source.questions.length>500) return fail();
 const questions=source.questions.map(validateQuestion).sort((a,b)=>a.order-b.order);
 if(!unique(questions.map(q=>q.id)) || questions.some((q,i)=>q.order!==i+1)) return fail();
 return {quiz_id:quizId,version_id:version,owner_id:ownerId,title,questions};
}
export function publicQuestion(q: Question): Omit<Question,'correct_answer'> {
 const data: Obj = {};
 if(q.type==='SINGLE_CHOICE' || q.type==='MULTIPLE_CHOICE') data.options=(q.data.options as Obj[]).map(x=>({id:x.id,text:x.text}));
 if(q.type==='MATCHING') {
   data.left=(q.data.left as Obj[]).map(x=>({id:x.id,text:x.text}));
   const right=(q.data.right as Obj[]).map(x=>({id:x.id,text:x.text}));
   for(let i=right.length-1;i>0;i--) { const j=randomInt(i+1); [right[i],right[j]]=[right[j],right[i]]; }
   data.right=right;
 }
 return {id:q.id,order:q.order,prompt:q.prompt,time_limit_seconds:q.time_limit_seconds,type:q.type,data};
}
