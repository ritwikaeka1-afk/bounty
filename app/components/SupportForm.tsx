"use client";
import { useState } from "react";
import { rpc } from "../../lib/data";
import { errorMessage } from "../../lib/rules";
export function SupportForm({bountyId}:{bountyId?:string}){
 const [status,S]=useState(""),[busy,B]=useState(false);
 return <form onSubmit={async e=>{e.preventDefault();const form=e.currentTarget,f=new FormData(form);B(true);S("");try{const id=await rpc<string>("send_support_request",{p_subject:f.get("subject"),p_message:f.get("message"),p_bounty:bountyId||null});S(`Request saved. Reference: ${id}. This is not an emergency service.`);form.reset();}catch(e){S(errorMessage(e));}finally{B(false);}}}><label>Subject<input name="subject" required minLength={3} maxLength={120}/></label><label>How can we help?<textarea name="message" required minLength={10} maxLength={3000} rows={5}/></label><button className="primary" disabled={busy}>{busy?"Sending…":"Send support request"}</button>{status&&<p role="status">{status}</p>}</form>;
}

