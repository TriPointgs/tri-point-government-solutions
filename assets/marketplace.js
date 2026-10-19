const $=id=>document.getElementById(id),storeKey='tp-sourcing-list-v1';
let items=[];try{const saved=JSON.parse(sessionStorage.getItem(storeKey)||'[]');if(Array.isArray(saved))items=saved.filter(i=>typeof i.description==='string'&&i.description.length<=160&&Number.isInteger(i.quantity)&&i.quantity>0&&i.quantity<=9999).slice(0,15);}catch{}
function render(){
 $('sourcing-items').replaceChildren();
 items.forEach((item,index)=>{const li=document.createElement('li'),copy=document.createElement('span'),button=document.createElement('button');copy.textContent=`${item.quantity} × ${item.description}`;button.type='button';button.className='experience-remove';button.textContent='Remove';button.setAttribute('aria-label',`Remove ${item.description}`);button.addEventListener('click',()=>{items.splice(index,1);save();$('request-status').textContent='Item removed.';});li.append(copy,button);$('sourcing-items').append(li);});
 const has=items.length>0;$('request-empty').hidden=has;$('prepare-request').hidden=!has;$('clear-request').hidden=!has;
 $('prepare-request').href='/contact?fromList=1';

}
function save(){try{sessionStorage.setItem(storeKey,JSON.stringify(items));}catch{$('request-status').textContent='Browser storage is unavailable. Keep this tab open until you submit your request.';}render();}
$('sourcing-form').addEventListener('submit',e=>{e.preventDefault();const description=$('request-item').value.trim(),quantity=Number($('request-quantity').value);if(!description||/[\r\n\x00-\x1f\x7f]/.test(description)||!Number.isInteger(quantity)||quantity<1||quantity>9999){$('request-status').textContent='Enter a description and a whole-number quantity between 1 and 9,999.';return;}if(items.length>=15){$('request-status').textContent='This list holds 15 items. Submit this request before adding another list.';return;}items.push({description,quantity});save();$('request-status').textContent='Added to your sourcing list. No order has been placed.';$('request-item').value='';$('request-item').focus();});
$('clear-request').addEventListener('click',()=>{items=[];save();$('request-status').textContent='Sourcing list cleared.';});
const params=new URLSearchParams(location.search),category=params.get('category'),q=(params.get('q')||'').slice(0,100);
if(q){$('request-item').value=q;$('category-status').textContent=`Sourcing request: “${q}”. This searches categories and prepares a request; live product search is not published yet.`;}
if(category){for(const a of document.querySelectorAll('.experience-category')){if(new URL(a.href).searchParams.get('category')===category){a.classList.add('is-selected');a.setAttribute('aria-current','true');$('category-status').textContent='Selected category: '+a.querySelector('h3').textContent+'. Add your requirements below.';}}}
render();
