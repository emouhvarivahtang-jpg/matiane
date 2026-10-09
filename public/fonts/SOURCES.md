# Matiane fonts

All bundled fonts are free of charge and permit commercial use and PDF embedding. Copyright and license notices are retained. Most files are unmodified originals; the new Google variable families are static instances with renamed internal families, as described below. The font licenses do not license the customer's
photographs or the application itself.

| Family | Upstream | License supplied here |
| --- | --- | --- |
| Noto Sans, Noto Serif, Noto Sans Georgian, Noto Serif Georgian (including condensed faces) | https://github.com/notofonts/noto-fonts | OFL.txt, SIL Open Font License 1.1 |
| FiraGO 1.001 | https://github.com/bBoxType/FiraGO, Fonts/FiraGO_TTF_1001/Roman | FiraGO-OFL.txt, SIL Open Font License 1.1 |
| DejaVu Sans, Serif, Sans Mono 2.37 | https://github.com/dejavu-fonts/dejavu-fonts/releases/tag/version_2_37 | DejaVu-LICENSE.txt, Bitstream Vera/DejaVu license |
| GNU FreeSans, FreeSerif, FreeMono, release 20120503 | https://ftp.gnu.org/gnu/freefont/freefont-ttf-20120503.zip | FreeFont-GPL.txt, FreeFont-README.txt (GPL-3.0-or-later and font embedding exception), FreeFont-CREDITS.txt |

GNU FreeFont corresponding editable sources are supplied in
[freefont-src-20120503.tar.gz](freefont-src-20120503.tar.gz), copied from
https://ftp.gnu.org/gnu/freefont/freefont-src-20120503.tar.gz. Build instructions
and font author credits are included in that archive. The embedding exception
permits documents using the font or unaltered portions of it to keep their own
license, including commercial printed books and PDF exports.

## Current text controls

The English/Russian selector offers Montserrat, Manrope, Lora, Cormorant Garamond,
Playfair Display, PT Serif, Alegreya, Caveat, Marck Script and Bad Script. The renamed Lora and Playfair derivatives appear as Matiane Book Serif and Matiane Display in the picker. Source:
https://github.com/google/fonts/tree/main/ofl/<family>. Each family has its own
`<family>-OFL.txt` here, SIL Open Font License 1.1. Static 400/700 instances of
variable families are produced with fontTools varLib.instancer and internally
renamed Matiane Collection A–G to respect reserved font names. Their TrueType glyph data is padded to 4-byte boundaries for correct fontkit PDF subsetting; outlines are unchanged. PT Serif,
Marck Script and Bad Script are unmodified static upstream faces. Original
italic faces are provided where the upstream family supplies them; otherwise
slant is synthesized. Regular-only families use synthesized bold.

The independent Georgian selector offers BPG Ingiri, Algeti, Glaho,
Chveulebrivi, Elite, Nino Medium, Nino Medium Condensed, Courier, Serif and
Serif Modern. These are ten distinct, unmodified original TrueType designs
from Besarion Paata Gugushvili, with all 33 modern Mkhedruli letters.

Source distribution: https://vault.centos.org/8.5.2111/AppStream/Source/SPackages/bpg-fonts-20120413-11.el8.src.rpm

`BPG-README.txt` contains the author’s explicit permission for free commercial
and noncommercial use and the GPL document-embedding exception. The complete
original editable font distribution is supplied in `BPG-original-2012.zip`;
GPL text is in `BPG-GPL.txt`. Serif Modern is under the Bitstream Vera license;
its original notices and the full Vera license are in
`BPG-Serif-Modern-LICENSE.txt`. BPG bold and italic are synthesized consistently
in the browser and PDF. Georgian font faces are restricted to Georgian Unicode
ranges in browser CSS so that they never replace the chosen Latin/Cyrillic face.

Older projects retain their original Noto, FiraGO, DejaVu and GNU FreeFont IDs.
Missing characters, including Georgian Mtavruli uppercase absent from the
older BPG designs, fall back to Noto Georgian in the browser and PDF.
