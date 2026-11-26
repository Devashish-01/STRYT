import { BadgeCheck, Camera, MapPin, Store } from "@/components/Icons";
import { Rating, SafeImg } from "@/components/common";
import LivePulseDot from "@/components/LivePulseDot";
import { distanceLabel } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Business } from "@/types";
import { formatHoursForDisplay } from "@/utils/availability";

interface BusinessStorefrontIdentityProps {
  business: Business;
  open: boolean;
  coverIndex: number;
  onOpenPhoto: (index: number) => void;
  onBrowsePhotos?: () => void;
  photoCount: number;
}

export default function BusinessStorefrontIdentity({
  business, open, coverIndex, onOpenPhoto, onBrowsePhotos, photoCount,
}: BusinessStorefrontIdentityProps) {
  const { t, tf } = useI18n();
  const category = business.subCategory || business.categoryName;
  const place = [business.addressLine1, business.city].filter(Boolean).join(", ");
  const hours = formatHoursForDisplay(business.hours);

  return (
    <header className="storefront-identity">
      <div className="storefront-identity-top">
        {coverIndex >= 0 ? (
          <button type="button" className="storefront-avatar"
            aria-label={tf("photo_n_of_m", { n: coverIndex + 1, m: photoCount })}
            onClick={() => onOpenPhoto(coverIndex)}>
            <SafeImg src={business.coverImage} alt="" variant="photo" />
          </button>
        ) : (
          <span className="storefront-avatar storefront-avatar-placeholder" aria-hidden="true"><Store size={33} /></span>
        )}
        <div className="storefront-name">
          {category && <p className="storefront-category">{category}</p>}
          <div className="storefront-name-line">
            <h1>{business.name}</h1>
            {business.isVerified && (
              <span className="storefront-verified" role="img" aria-label={t("verified_badge")}>
                <BadgeCheck size={19} />
              </span>
            )}
          </div>
          {business.city && <p className="storefront-city"><MapPin size={14} aria-hidden="true" />{business.city}</p>}
        </div>
      </div>

      {business.description && <p className="storefront-bio">{business.description}</p>}

      {(business.isNew || Boolean(business.tags?.length)) && (
        <div className="row wrap gap-6">
          {business.isNew && <span className="badge badge-new">{t("new_word")}</span>}
          {[...new Set(business.tags ?? [])].map(tag => <span key={tag} className="badge badge-gray">{tag}</span>)}
        </div>
      )}

      <div className="storefront-facts">
        <div className="storefront-fact">
          <div className="storefront-fact-value"><Rating value={business.ratingAvg} size={16} /></div>
          <span>{business.ratingCount} {t(business.ratingCount === 1 ? "review_suffix_one" : "reviews_suffix")}</span>
        </div>
        <div className="storefront-fact">
          <div className="storefront-fact-value storefront-open" data-open={open}>
            {open && <LivePulseDot />}{t(open ? "open_now" : "closed_status")}
          </div>
          <span>{hours}</span>
        </div>
        {onBrowsePhotos && (
          <button type="button" className="storefront-fact storefront-photos-link" onClick={onBrowsePhotos}>
            <span className="storefront-fact-value"><Camera size={18} aria-hidden="true" />{photoCount}</span>
            <span>{t("bon_step_photos")}</span>
          </button>
        )}
      </div>

      {place && (
        <p className="storefront-address">
          <MapPin size={15} aria-hidden="true" />
          <span>{place}{business.distanceKm > 0 ? ` · ${distanceLabel(business.distanceKm, t)}` : ""}</span>
        </p>
      )}
    </header>
  );
}
