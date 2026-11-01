export function publicSite(input:string):string {
 const value=new URL(input);
 if(!["https:","http:"].includes(value.protocol))throw new Error("Only HTTP(S) sites supported");
 if(value.username||value.password)throw new Error("Credential-bearing URLs disallowed");
 const h=value.hostname.toLowerCase();
 if(!h||h==="localhost"||h.endsWith(".local")||h.endsWith(".internal")||h.endsWith(".localhost")||h.includes("%")||/^\d+$/.test(h)||/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)||h==="::1"||h.startsWith("[")||h.endsWith(".onion"))throw new Error("Private and loopback hosts are prohibited");
 if(value.port&&!["80","443"].includes(value.port))throw new Error("Custom ports are prohibited");
 return value.toString();
}
