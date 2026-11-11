function isPrivateIpv4(host: string): boolean {
 const parts=host.split(".").map(Number); if(parts.length!==4||parts.some(n=>!Number.isInteger(n)||n<0||n>255)) return false;
 return parts[0]===10||parts[0]===127||parts[0]===0||parts[0]>=224||
  (parts[0]===169&&parts[1]===254)||(parts[0]===172&&parts[1]>=16&&parts[1]<=31)||(parts[0]===192&&parts[1]===168);
}
export function assertSafeProviderUrl(input: string): URL {
 const url=new URL(input);
 if(url.protocol!=="https:"||url.username||url.password||url.port&&url.port!=="443") throw new Error("Provider URL must be a public HTTPS URL");
 const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,"");
 if(host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host==="::1"||host.startsWith("fc")||host.startsWith("fd")||host.startsWith("fe80:")||isPrivateIpv4(host)) throw new Error("Private and local provider hosts are not allowed");
 return url;
}
