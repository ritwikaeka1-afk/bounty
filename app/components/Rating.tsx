export function Rating({rating,count}:{rating:number|null;count:number}){
 return <span className="rating" aria-label={count?`${Number(rating).toFixed(1)} out of 5 from ${count} completed-task reviews`:"New member, no reviews yet"}>
   <span className="rating-stars" aria-hidden="true">{[1,2,3,4,5].map(n=><span key={n} className={rating!==null&&n<=Math.round(Number(rating))?"filled":""}>★</span>)}</span>
   <span>{count?`${Number(rating).toFixed(1)} (${count})`:"New · no reviews yet"}</span>
 </span>;
}
