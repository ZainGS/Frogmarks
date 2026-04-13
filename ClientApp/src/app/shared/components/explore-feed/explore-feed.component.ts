import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

interface GridItem {
  id: string;
  title: string;
  imageUrl: string;
  mangaId: string;
}

@Component({
  selector: 'app-explore-feed',
  standalone: false,
  templateUrl: './explore-feed.component.html',
  styleUrl: './explore-feed.component.scss'
})
export class ExploreFeedComponent implements OnInit {
  gridItems: GridItem[] = [];
  isLoading = true;
  // Overlay / interaction state
  selectedItem: GridItem | null = null;
  overlayOpen = false;
  selectedIndex: number | null = null;
  menuStyle: { [key: string]: any } = {};
  // side of the menu relative to the selected item ('left' or 'right')
  menuSide: 'left' | 'right' | null = null;
  // style for the tail element (positioning)
  menuTailStyle: { [key: string]: any } | null = null;
  // Index currently pressed (for wiggle) and most recently released (for lift/fade)
  pressedIndex: number | null = null;
  releasedIndex: number | null = null;

  // Track disliked item ids
  private dislikedIds = new Set<string>();
  // Track liked item ids
  private likedIds = new Set<string>();
  // Simple transient state for icon press/pop animations. Values: null | 'like-press' | 'like-pop' | 'dislike-press' | 'dislike-pop'
  iconState: string | null = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadMangaFromMangaDex();
  }

  private async loadMangaFromMangaDex() {
    try {
      const baseUrl = 'https://api.mangadex.org';
      
      // Fetch popular manga with cover art included
      const response: any = await this.http.get(`${baseUrl}/manga`, {
        params: {
          limit: '100',
          'order[followedCount]': 'desc',
          'includes[]': 'cover_art',
          'contentRating[]': ['safe']
        }
      }).toPromise();
//, 'suggestive'
      console.log('MangaDex API Response:', response);

      // Transform the response into grid items
      this.gridItems = response.data
        .filter((manga: any) => {
          // Find the cover art relationship
          const coverArt = manga.relationships.find((rel: any) => rel.type === 'cover_art');
          return coverArt && coverArt.attributes?.fileName;
        })
        .map((manga: any) => {
          const coverArt = manga.relationships.find((rel: any) => rel.type === 'cover_art');
          const coverFileName = coverArt.attributes.fileName;
          
          // Build cover URL using 512px thumbnail
          const coverUrl = `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}.512.jpg`;
          
          // Get manga title (prefer English, fallback to first available)
          const title = manga.attributes.title.en || 
                       Object.values(manga.attributes.title)[0] || 
                       'Unknown Title';

          return {
            id: manga.id,
            title: title,
            imageUrl: coverUrl,
            mangaId: manga.id
          };
        });

      console.log('Loaded manga covers:', this.gridItems);
      this.isLoading = false;
    } catch (error) {
      console.error('Failed to load manga from MangaDex:', error);
      this.isLoading = false;
      // Fallback to placeholder if API fails
      this.loadFallbackData();
    }
  }

  private loadFallbackData() {
    // Fallback placeholder images if MangaDex API fails
    const placeholders = Array.from({ length: 20 }, (_, i) => ({
      id: `placeholder-${i}`,
      title: `Manga ${i + 1}`,
      imageUrl: `https://via.placeholder.com/300x400/333/fff?text=Manga+${i + 1}`,
      mangaId: `placeholder-${i}`
    }));
    
    this.gridItems = placeholders;
  }

  onItemClick(item: GridItem) {
    console.log('Manga clicked:', item.title, `https://mangadex.org/title/${item.mangaId}`);
  }

  onItemMouseDown(item: GridItem, index: number, ev?: MouseEvent) {
    ev?.stopPropagation();
    this.pressedIndex = index;
    this.releasedIndex = null;
  }

  onItemMouseUp(item: GridItem, index: number, ev?: MouseEvent) {
  ev?.stopPropagation();
  // On mouseup: clear pressed, trigger grow/settle animation via releasedIndex,
  // and open the menu immediately next to the item.
  this.pressedIndex = null;
  this.releasedIndex = index;
  this.openOverlay(item, index);
  }

  onItemMouseLeave(index: number, ev?: MouseEvent) {
    // cancel pressed wiggle if pointer leaves
    if (this.pressedIndex === index) this.pressedIndex = null;
  }

  openOverlay(item: GridItem, index?: number) {
    this.selectedItem = item;
    this.selectedIndex = (typeof index === 'number') ? index : this.gridItems.findIndex(g => g.id === item.id);
    this.overlayOpen = true;
    // prevent body scroll when overlay open
    document.body.style.overflow = 'hidden';

    // compute menu position so it appears to the side away from the viewport edge
    setTimeout(() => {
      try {
        const el = document.querySelector(`[data-id="${item.id}"]`) as HTMLElement | null;
        const menuWidth = Math.min(520, Math.round(window.innerWidth * 0.45));
        const rect = el?.getBoundingClientRect();
        if (rect) {
          const verticalCenter = rect.top + rect.height / 2;
          // estimate menu height half for centering; will clamp later by CSS overflow
          const menuHalf = 200;
          const top = Math.max(12, Math.min(verticalCenter - menuHalf, window.innerHeight - 24 - menuHalf * 2));
          if (rect.left < window.innerWidth / 2) {
            // put menu to the right of item; compute left coordinate and clamp
            const desiredLeft = rect.right + 16.5;
            const left = Math.max(8, Math.min(desiredLeft, window.innerWidth - menuWidth - 8));
            this.menuStyle = { position: 'fixed', left: `${left}px`, top: `${top}px`, width: `${menuWidth}px` };
            this.menuSide = 'right';
            // compute tail so it points from menu left edge to near item's vertical center
            const tailLeft = left - 8; // tail sits slightly outside menu left edge
            const tailTop = Math.max(8, Math.min(verticalCenter - 12, window.innerHeight - 24));
            this.menuTailStyle = { position: 'fixed', left: `${tailLeft}px`, top: `${tailTop}px` };
          } else {
            // put menu to the left of item; compute left coordinate so menu's right edge sits near rect.left - 16.5
            const desiredLeft = rect.left - 23.5 - menuWidth;
            const left = Math.max(8, Math.min(desiredLeft, window.innerWidth - menuWidth - 8));
            this.menuStyle = { position: 'fixed', left: `${left}px`, top: `${top}px`, width: `${menuWidth}px` };
            this.menuSide = 'left';
            // compute tail so it points from menu right edge to near item's vertical center
            const tailLeft = left + menuWidth + 8; // tail sits slightly outside menu right edge
            const tailTop = Math.max(8, Math.min(verticalCenter - 12, window.innerHeight - 24));
            this.menuTailStyle = { position: 'fixed', left: `${tailLeft}px`, top: `${tailTop}px` };
          }
        } else {
          this.menuStyle = {};
          this.menuSide = null;
          this.menuTailStyle = null;
        }
      } catch (e) {
        this.menuStyle = {};
        this.menuSide = null;
        this.menuTailStyle = null;
      }
    }, 8);
  }

  closeOverlay(ev?: Event) {
    ev?.stopPropagation();
  this.overlayOpen = false;
  this.selectedItem = null;
  // restore state without triggering opacity fades
  this.releasedIndex = null;
  this.selectedIndex = null;
  this.menuStyle = {};
  this.menuSide = null;
  this.menuTailStyle = null;
  // remove overflow lock
  document.body.style.overflow = '';
  }

  view(item: GridItem | null) {
    if (!item) return;
    // For now, open in new tab
    window.open(`https://mangadex.org/title/${item.mangaId}`, '_blank');
  }

  remix(item: GridItem | null) {
    if (!item) return;
    console.log('Remix requested for', item.title);
  }

  toggleDislike(item: GridItem | null, ev?: Event) {
    if (!item) return;
    ev?.stopPropagation();
    if (this.dislikedIds.has(item.id)) {
      this.dislikedIds.delete(item.id);
    } else {
      // If item was liked, remove like when disliking
      if (this.likedIds.has(item.id)) this.likedIds.delete(item.id);
      this.dislikedIds.add(item.id);
    }
    // Force change so UI updates; if using OnPush this would need change detector
  }

  // Icon press/release handlers to trigger CSS animations
  onIconMouseDown(kind: 'like' | 'dislike', ev?: Event) {
    ev?.stopPropagation();
    this.iconState = `${kind}-press`;
  }

  onIconMouseUp(kind: 'like' | 'dislike', ev?: Event) {
    ev?.stopPropagation();
    // If we were pressing, switch to pop state which will run the animation
    if (this.iconState === `${kind}-press`) {
      this.iconState = `${kind}-pop`;
      // Clear the pop state after the animation duration (200ms) to return to normal
      setTimeout(() => {
        // only clear if still the same pop state
        if (this.iconState === `${kind}-pop`) this.iconState = null;
      }, 220);
    } else {
      // Not in press state, just briefly pop
      this.iconState = `${kind}-pop`;
      setTimeout(() => { if (this.iconState === `${kind}-pop`) this.iconState = null; }, 220);
    }
  }

  onIconMouseLeave(kind: 'like' | 'dislike', ev?: Event) {
    ev?.stopPropagation();
    // Cancel press if pointer leaves
    if (this.iconState === `${kind}-press`) this.iconState = null;
  }

  toggleLike(item: GridItem | null, ev?: Event) {
    if (!item) return;
    ev?.stopPropagation();
    if (this.likedIds.has(item.id)) {
      this.likedIds.delete(item.id);
    } else {
      // If item was disliked, remove dislike when liking
      if (this.dislikedIds.has(item.id)) this.dislikedIds.delete(item.id);
      this.likedIds.add(item.id);
    }
  }

  isLiked(item: GridItem | null): boolean {
    if (!item) return false;
    return this.likedIds.has(item.id);
  }

  isDisliked(item: GridItem | null): boolean {
    if (!item) return false;
    return this.dislikedIds.has(item.id);
  }

  isLeftHalf(index: number): boolean {
    const cols = Math.floor((window.innerWidth - 100) / 180); // Approximate columns
    const colPosition = index % cols;
    return colPosition < cols / 2;
  }
}