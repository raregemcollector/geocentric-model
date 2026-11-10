import sys
from PIL import Image
fs=sys.argv[2:]; ims=[Image.open(f).resize((360,640)) for f in fs]
cols=min(5,len(ims)); rows=(len(ims)+cols-1)//cols
c=Image.new('RGB',(cols*360+(cols-1)*6,rows*640+(rows-1)*6),'white')
for i,im in enumerate(ims): c.paste(im,((i%cols)*366,(i//cols)*646))
c.save(sys.argv[1],quality=88)
