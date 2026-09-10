import {rpc} from "./data";
export function track(event: "browse"|"detail"|"post_step_1"|"post_step_2"|"post_step_3"|"empty_search"|"inbox") {
  if(process.env.NEXT_PUBLIC_ANALYTICS_ENABLED!=="true")return;
  void rpc("record_product_event",{p_event:event}).catch(()=>{});
}
