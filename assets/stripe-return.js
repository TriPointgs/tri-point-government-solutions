// Cross-site Stripe GET lands on this no-data page; the following same-site navigation
// restores Strict administrator-cookie semantics without relaxing site-wide security.
const q=new URL(location.href).searchParams;
const run=q.get('run');
if(run&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(run)&&q.getAll('run').length===1){
  location.replace('/admin/stripe-checkout?run='+encodeURIComponent(run));
}else{location.replace('/admin/stripe-checkout');}
