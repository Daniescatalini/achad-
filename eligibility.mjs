// Regra pura para futura integração do servidor. Não envia mensagens.
export function eligibility({offer,review,settings,now=Date.now(),lastSentAt=null,sentToday=0,channelVerified=false}) {
 const blocked=[];
 if(!channelVerified) blocked.push('channel_unverified');
 if(review?.status!=='approved'||!review?.message?.trim()) blocked.push('review_required');
 if(!offer||offer.demo) return {eligible:false,reasons:[...blocked,'real_offer_required']};
 if(!Number.isFinite(offer.price)||offer.price<=0) blocked.push('invalid_price');
 if(!Number.isFinite(offer.commission)||offer.commission<settings.commission||offer.commission>100) blocked.push('invalid_commission');
 if(!Number.isFinite(offer.rating)||offer.rating<settings.minimumRating) blocked.push('rating_below_minimum');
 if(!settings.niches.includes(offer.niche)) blocked.push('niche_not_selected');
 if(offer.price>settings.maxPrice) blocked.push('price_above_maximum');
 if(!Number.isFinite(offer.old_price)||offer.old_price<=0||!offer.reference_verified||100*(1-offer.price/offer.old_price)<settings.discount) blocked.push('discount_unverified');
 if(!offer.in_stock) blocked.push('out_of_stock');
 if(!Number.isFinite(offer.checked_at)||offer.checked_at>now||now-offer.checked_at>120000) blocked.push('stale_offer');
 if(!Number.isFinite(offer.expires_at)||offer.expires_at<=now) blocked.push('expired_offer');
 if(offer.coupon&&!offer.coupon_verified) blocked.push('coupon_unverified');
 if(!offer.affiliate_verified) blocked.push('affiliate_unverified');
 try{const u=new URL(offer.affiliate_url);if(u.protocol!=='https:'||u.username||u.password)blocked.push('invalid_url')}catch{blocked.push('invalid_url')}
 // Any change after approval invalidates both price claims and edited copy.
 if(!offer.revision||review?.offer_revision!==offer.revision) blocked.push('changed_since_review');
 if(lastSentAt!==null&&now-lastSentAt<settings.cooldown*3600000) blocked.push('duplicate_cooldown');
 if(sentToday>=settings.dailyLimit) blocked.push('daily_limit');
 return {eligible:blocked.length===0,reasons:blocked};
}
