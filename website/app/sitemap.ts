import type { MetadataRoute } from "next";
import { SITE_URL } from "./site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
      images: [`${SITE_URL}/media/editor-demo.jpg`, `${SITE_URL}/media/step-select.jpg`],
      videos: [
        {
          title: "Editing a screenshot in InstantShot",
          thumbnail_loc: `${SITE_URL}/media/editor-demo.jpg`,
          description:
            "A screenshot is selected, marked up with arrows and text, and placed on a wallpaper in the InstantShot editor.",
          content_loc: `${SITE_URL}/media/editor-demo.mp4`,
        },
      ],
    },
  ];
}
