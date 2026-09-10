"use client";
import {useEffect,useState} from "react";
import {createClient} from "../../lib/supabase/client";
import {errorMessage,formatDate} from "../../lib/rules";
import {Dialog} from "./Dialog";
export function ApplicationChat({proposalId,userId,peer,canSend,onClose}:{proposalId:string;userId:string;peer:string;canSend:boolean;onClose:()=>void}){
 const [messages,M]=useState<{id:string;sender_id:string;body:string;created_at:string}[]>([]),[error,E]=useState(""),[busy,B]=useState(false);
 async function load(){const {data,error}=await createClient().from("application_messages").select("id,sender_id,body,created_at").eq("proposal_id",proposalId).order("created_at",{ascending:false}).limit(100);if(error)E(error.message);else M((data||[]).reverse());}
 useEffect(()=>{void load();},[proposalId]);
 return <Dialog title={`Conversation with ${peer}`} onClose={onClose}><p>Private to you and this applicant or poster. Discuss the task before committing.</p><button className="text-button" onClick={()=>void load()}>Refresh messages</button><div className="messages">{messages.length?messages.map(m=><article key={m.id} className={m.sender_id===userId?"own-message":""}><small>{m.sender_id===userId?"You":peer} · {formatDate(m.created_at)}</small><p>{m.body}</p></article>):<p>No messages yet.</p>}</div>{canSend&&<form onSubmit={async e=>{e.preventDefault();const form=e.currentTarget,body=String(new FormData(form).get("body"));B(true);E("");try{const {error}=await createClient().from("application_messages").insert({proposal_id:proposalId,sender_id:userId,body});if(error)throw error;form.reset();await load();}catch(e){E(errorMessage(e));}finally{B(false);}}}><label>Message<textarea name="body" required maxLength={2000} rows={3}/></label><button className="primary" disabled={busy}>{busy?"Sending…":"Send message"}</button></form>}{error&&<p role="alert">{error}</p>}</Dialog>;
}

