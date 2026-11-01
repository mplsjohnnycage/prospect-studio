export type PreviewForm={name:string;email:string;message:string};
export function validateDemoSubmission(value:unknown):PreviewForm{
 if(!value||typeof value!=="object")throw Error("Preview form is required");
 const data=value as Record<string,unknown>;
 if(typeof data.name!=="string"||typeof data.email!=="string"||typeof data.message!=="string")throw Error("Invalid preview form");
 const name=data.name.trim(),email=data.email.trim().toLowerCase(),message=data.message.trim();
 if(name.length<2||name.length>120)throw Error("Name must be 2 to 120 characters");
 if(email.length>220||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).test(email))throw Error("Valid email required");
 if(message.length<10||message.length>2000)throw Error("Project details must be 10 to 2,000 characters");
 return {name,email,message};
}
type PreviewEvent={source:unknown;origin:string;data:unknown};
export function shouldAcceptPreviewMessage(evt:PreviewEvent,frameSource:unknown,prospectId:string,direction:string):boolean {
 if(evt.source===null||evt.source===undefined||evt.source!==frameSource||evt.origin!=="null")return false;
 if(!evt.data||typeof evt.data!=="object")return false;
 const d=evt.data as Record<string,unknown>;
 return d.type==="prospect-studio:demo-submit"&&d.version===1&&d.prospectId===prospectId&&d.direction===direction;
}
