const STORAGE_KEY='hungfashion-electron-test-center-v1';
const cases=[
{group:'manager',title:'Người quản lý',items:[
['M01','Thêm khách hàng mới','Tạo một hồ sơ khách hàng với thông tin hợp lệ.','Khách hàng mới xuất hiện trong danh sách; dữ liệu được lưu đúng.'],
['M02','Xóa khách hàng','Thực hiện thao tác xóa/ẩn danh hóa trên khách hàng thử nghiệm.','Hồ sơ được xử lý theo chính sách; lịch sử đơn hàng/giao dịch vẫn được bảo toàn.'],
['M03','Khóa tài khoản khách hàng','Khóa tài khoản thử nghiệm đang hoạt động.','Tài khoản không thể tiếp tục đăng nhập; các phiên đang hoạt động bị thu hồi.'],
['M04','Tiếp nhận phản hồi khách hàng','Mở phản hồi, cập nhật trạng thái và phản hồi lại khách.','Nội dung, trạng thái và phản hồi được lưu và hiển thị đúng.'],
['M05','Báo cáo độ tuổi và sở thích','Mở báo cáo khách hàng, đối chiếu số liệu và tỷ lệ.','Có thống kê nhóm tuổi, sở thích và tỷ lệ tương ứng.'],
['M06','Tạo và gửi khảo sát','Tạo khảo sát có câu hỏi, chọn nhóm khách phù hợp, xem trước rồi gửi.','Khảo sát được lưu; lời mời gửi đúng nhóm khách được chọn.'],
['M07','Thống kê kết quả khảo sát','Mở báo cáo khảo sát đã có câu trả lời.','Hiển thị số lượt trả lời, thống kê lựa chọn và câu trả lời tự luận.']
]},
{group:'customer',title:'Khách hàng',items:[
['C01','Đăng ký tài khoản','Đăng ký bằng email chưa được sử dụng và thông tin hợp lệ.','Tài khoản được tạo; không tự động đăng nhập nếu luồng yêu cầu đăng nhập riêng.'],
['C02','Đăng nhập','Đăng nhập bằng tài khoản khách hàng hợp lệ và thử sai mật khẩu.','Đăng nhập đúng được chấp nhận; thông tin sai bị từ chối rõ ràng.'],
['C03','Chỉnh sửa thông tin','Cập nhật hồ sơ, ngày sinh, số điện thoại và sở thích.','Thông tin mới được lưu và hiển thị lại sau khi tải trang.'],
['C04','Gửi phản hồi sản phẩm','Gửi đánh giá, nội dung và ảnh (nếu có) cho sản phẩm thử nghiệm.','Phản hồi được ghi nhận và xuất hiện trong danh sách của khách/quản lý.'],
['C05','Nhận và thực hiện khảo sát','Đăng nhập khách đã được mời, mở khảo sát và gửi câu trả lời.','Khách thấy đúng khảo sát được mời; câu trả lời được ghi nhận và tính vào kết quả.']
]}
];
let state={};try{state=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch{state={}}
let filter='all';
const groups=document.querySelector('#groups');
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));render()}
function render(){
 groups.innerHTML='';
 const visible=cases.filter(g=>filter==='all'||g.group===filter);
 visible.forEach(group=>{
  const section=document.createElement('section');section.className='group';
  const head=document.createElement('div');head.className='group-head';
  const title=document.createElement('h2');title.textContent=group.title;
  const count=document.createElement('span');const done=group.items.filter(x=>state[x[0]]?.status==='pass').length;count.textContent=done+'/'+group.items.length+' đạt';
  head.append(title,count);section.append(head);
  group.items.forEach(item=>{
   const [id,name,steps,expected]=item;const value=state[id]||{status:'skip',note:''};
   const row=document.createElement('article');row.className='case';
   const copy=document.createElement('div');const h=document.createElement('h3');h.textContent=id+' · '+name;
   const p=document.createElement('p');p.textContent='Cách kiểm thử: '+steps;
   const e=document.createElement('p');e.className='expected';e.textContent='Kết quả mong đợi: '+expected;copy.append(h,p,e);
   const controls=document.createElement('div');controls.className='case-controls';
   const statuses=document.createElement('div');statuses.className='status';
   [['pass','Đạt'],['fail','Lỗi'],['skip','Chưa thử']].forEach(([key,label])=>{const b=document.createElement('button');b.textContent=label;if(value.status===key)b.className='selected '+key;b.addEventListener('click',()=>{state[id]={...value,status:key};save()});statuses.append(b)});
   const note=document.createElement('textarea');note.placeholder='Ghi chú / lỗi gặp phải…';note.value=value.note||'';note.setAttribute('aria-label','Ghi chú '+id);note.addEventListener('change',()=>{state[id]={...value,note:note.value};localStorage.setItem(STORAGE_KEY,JSON.stringify(state))});
   controls.append(statuses,note);row.append(copy,controls);section.append(row);
  });
  groups.append(section);
 });
 const all=cases.flatMap(g=>g.items);const passed=all.filter(x=>state[x[0]]?.status==='pass').length;const failed=all.filter(x=>state[x[0]]?.status==='fail').length;
 document.querySelector('#progress').textContent=Math.round(passed/all.length*100)+'%';
 document.querySelector('#counts').textContent=passed+' / '+all.length+' đạt · '+failed+' lỗi';
 document.querySelector('#bar').style.width=(passed/all.length*100)+'%';
}
document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===b));render()}));
document.querySelector('#reset').addEventListener('click',()=>{if(confirm('Xóa toàn bộ trạng thái và ghi chú kiểm thử trên máy này?')){state={};save()}});
document.querySelector('#export').addEventListener('click',()=>{
 const rows=[['Mã','Nhóm','Chức năng','Trạng thái','Ghi chú'],...cases.flatMap(g=>g.items.map(x=>[x[0],g.title,x[1],({pass:'Đạt',fail:'Lỗi',skip:'Chưa thử'})[state[x[0]]?.status||'skip'],state[x[0]]?.note||'']))];
 const csv='\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='hungfashion-test-results.csv';a.click();URL.revokeObjectURL(url);
});
render();